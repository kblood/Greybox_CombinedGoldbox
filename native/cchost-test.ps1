# cchost-test.ps1 -- contract smoke for the extracted GBBOOT combat host.
#
# A valid GBHR v1 request mutates only the declared COK result files.  Truncated,
# trailing-byte, and noncanonical-path requests must fail before changing them.
param([switch]$Headless, [string]$Root = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'

$root = $Root
$native = Join-Path $root 'native'
$build = Join-Path $native 'build'
$run = Join-Path $build 'cchost-test'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
. (Join-Path $native 'dosbox-smoke.ps1')

& (Join-Path $native 'build.ps1') -Target cchost
$nasm = 'C:\Users\Caldor\AppData\Local\bin\NASM\nasm.exe'
if (-not (Test-Path $nasm)) { $nasm = (Get-Command nasm -ErrorAction Stop).Source }
$faultCom = Join-Path $build 'cchost-finalization-fault.com'
& $nasm -f bin -I ((Join-Path $native 'src') + '/') -D CCHOST_TEST_FAIL_FINAL_RECEIPT=1 (Join-Path $native 'src\cchost.asm') -o $faultCom
if ($LASTEXITCODE -ne 0) { throw 'NASM did not build CCHOST finalization-fault fixture' }
$preparedFaultCom = Join-Path $build 'cchost-prepared-fault.com'
& $nasm -f bin -I ((Join-Path $native 'src') + '/') -D CCHOST_TEST_FAIL_PREPARED=1 (Join-Path $native 'src\cchost.asm') -o $preparedFaultCom
if ($LASTEXITCODE -ne 0) { throw 'NASM did not build CCHOST prepared-state fault fixture' }
$recoveryStopCom = Join-Path $build 'cchost-recovery-stop.com'
& $nasm -f bin -I ((Join-Path $native 'src') + '/') -D CCHOST_TEST_STOP_AFTER_RECOVERY=1 (Join-Path $native 'src\cchost.asm') -o $recoveryStopCom
if ($LASTEXITCODE -ne 0) { throw 'NASM did not build CCHOST recovery-stop fixture' }
$damagePreflightFaultCom = Join-Path $build 'cchost-damage-preflight-fault.com'
& $nasm -f bin -I ((Join-Path $native 'src') + '/') -D CCHOST_TEST_FAIL_DOK_SOURCE_PREFLIGHT=1 (Join-Path $native 'src\cchost.asm') -o $damagePreflightFaultCom
if ($LASTEXITCODE -ne 0) { throw 'NASM did not build CCHOST DAMAGE source-preflight fault fixture' }
$damageWriterFaultCom = Join-Path $build 'cchost-damage-writer-fault.com'
& $nasm -f bin -I ((Join-Path $native 'src') + '/') -D CCHOST_TEST_FAIL_DOK_SAVE_OPEN=1 (Join-Path $native 'src\cchost.asm') -o $damageWriterFaultCom
if ($LASTEXITCODE -ne 0) { throw 'NASM did not build CCHOST DAMAGE writer-open fault fixture' }
$tokenBypassCom = Join-Path $build 'cchost-token-bypass.com'
& $nasm -f bin -I ((Join-Path $native 'src') + '/') -D CCHOST_TEST_SKIP_DAMAGE_TOKEN=1 (Join-Path $native 'src\cchost.asm') -o $tokenBypassCom
if ($LASTEXITCODE -ne 0) { throw 'NASM did not build CCHOST token-validation bypass fixture' }
# Direct-DAMAGE journal (GBDJ) reader: recover_damage_journal always falls into
# .close_bad today, so a plain "/R was rejected" fixture cannot discriminate a
# real fix from a no-op. This test-only build prints a distinct marker just
# before that unconditional fall-through so a rejection fixture can be seen
# failing. The production build (no -D) is unaffected by this define.
$gbdjMarkerCom = Join-Path $build 'cchost-gbdj-accept-mark.com'
& $nasm -f bin -I ((Join-Path $native 'src') + '/') -D CCHOST_TEST_GBDJ_ACCEPT_MARK=1 (Join-Path $native 'src\cchost.asm') -o $gbdjMarkerCom
if ($LASTEXITCODE -ne 0) { throw 'NASM did not build CCHOST GBDJ accept-mark fixture' }
# Step 5 handle-budget fixtures (H8/H9/H9F): each opens K extra NUL handles
# before recover_damage_journal runs, so a passing destination preflight on a
# journal targeting N real destinations proves 5 standard + K held + (1 roster
# + N source) retained <= 20 for that (K, N) pair. Both also carry the accept
# marker so a pass is directly observable.
$gbdjHold8Com = Join-Path $build 'cchost-gbdj-hold8.com'
& $nasm -f bin -I ((Join-Path $native 'src') + '/') -D CCHOST_TEST_GBDJ_ACCEPT_MARK=1 -D CCHOST_TEST_GBDJ_HOLD_HANDLES=8 (Join-Path $native 'src\cchost.asm') -o $gbdjHold8Com
if ($LASTEXITCODE -ne 0) { throw 'NASM did not build CCHOST GBDJ 8-handle-hold fixture' }
$gbdjHold9Com = Join-Path $build 'cchost-gbdj-hold9.com'
& $nasm -f bin -I ((Join-Path $native 'src') + '/') -D CCHOST_TEST_GBDJ_ACCEPT_MARK=1 -D CCHOST_TEST_GBDJ_HOLD_HANDLES=9 (Join-Path $native 'src\cchost.asm') -o $gbdjHold9Com
if ($LASTEXITCODE -ne 0) { throw 'NASM did not build CCHOST GBDJ 9-handle-hold fixture' }
if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null
Copy-Item (Join-Path $build 'cchost.com') (Join-Path $run 'CCHOST.COM') -Force
Copy-Item (Join-Path $build 'cchost.com') (Join-Path $run 'CCHOST.OK') -Force
Copy-Item $faultCom (Join-Path $run 'CCHOST.FLT') -Force
Copy-Item $preparedFaultCom (Join-Path $run 'CCHOST.PRP') -Force
Copy-Item $recoveryStopCom (Join-Path $run 'CCHOST.RCV') -Force
Copy-Item $damagePreflightFaultCom (Join-Path $run 'CCHOST.PFL') -Force
Copy-Item $damageWriterFaultCom (Join-Path $run 'CCHOST.WPF') -Force
Copy-Item $tokenBypassCom (Join-Path $run 'CCHOST.TBP') -Force

function Set-U16([byte[]]$Bytes, [int]$Offset, [int]$Value) {
  [BitConverter]::GetBytes([UInt16]$Value).CopyTo($Bytes, $Offset)
}
function Set-U32([byte[]]$Bytes, [int]$Offset, [uint32]$Value) {
  [BitConverter]::GetBytes($Value).CopyTo($Bytes, $Offset)
}
function New-CanonicalPath([byte[]]$Request, [int]$Offset, [string]$Path) {
  $raw = [Text.Encoding]::ASCII.GetBytes($Path)
  if ($raw.Length -ge 112) { throw "Test pathname is too long: $Path" }
  $raw.CopyTo($Request, $Offset)
}
function New-Request([int]$Mode, [string]$ResultPath, [string]$RosterPath, [string]$EffectPath) {
  $new = New-Object byte[] 346
  [Text.Encoding]::ASCII.GetBytes('GBHR').CopyTo($new, 0)
  Set-U16 $new 4 1
  Set-U16 $new 6 $Mode
  Set-U16 $new 8 0
  New-CanonicalPath $new 10 $ResultPath
  New-CanonicalPath $new 122 $RosterPath
  New-CanonicalPath $new 234 $EffectPath
  return ,$new
}

$rng = [Convert]::ToUInt32('89ABCDEF', 16)
$result = New-Object byte[] 22
[Text.Encoding]::ASCII.GetBytes('GBCR').CopyTo($result, 0)
Set-U16 $result 4 2
Set-U16 $result 6 0
Set-U16 $result 8 10
Set-U16 $result 10 1
Set-U32 $result 12 $rng
$result[16] = 0
$result[17] = 1
Set-U16 $result 18 7
Set-U16 $result 20 10
[IO.File]::WriteAllBytes((Join-Path $run 'GOOD.GCR'), $result)

$roster = New-Object byte[] (16 + 410)
[Text.Encoding]::ASCII.GetBytes('GBPR').CopyTo($roster, 0)
Set-U16 $roster 4 1
Set-U16 $roster 6 1
Set-U16 $roster 8 410
Set-U16 $roster 10 0
$roster[16] = 1
$roster[16 + 1 + 392] = 0
$roster[16 + 1 + 407] = 20
[IO.File]::WriteAllBytes((Join-Path $run 'GOOD.GPR'), $roster)

$effect = New-Object byte[] 130
[Text.Encoding]::ASCII.GetBytes('GBEF').CopyTo($effect, 0)
[IO.File]::WriteAllBytes((Join-Path $run 'GOOD.GEF'), $effect)

# Direct supported-effect consumer: one automatic 1d2+1 DAMAGE reaches the
# roster exactly once through CCHOST, independently of GBHR combat handling.
$damageEffect = New-Object byte[] 5750
[Text.Encoding]::ASCII.GetBytes('GBEF').CopyTo($damageEffect, 0)
Set-U16 $damageEffect 4 9
[Text.Encoding]::ASCII.GetBytes('GBSX').CopyTo($damageEffect, 2246)
Set-U16 $damageEffect 2250 1
Set-U16 $damageEffect 2252 0x2e; Set-U16 $damageEffect 2254 5
Set-U16 $damageEffect 2256 0xe0; Set-U16 $damageEffect 2258 1
Set-U16 $damageEffect 2260 2; Set-U16 $damageEffect 2262 1
$damageRoster = [byte[]]$roster.Clone()
[IO.File]::WriteAllBytes((Join-Path $run 'DMG.EFX'), $damageEffect)
[IO.File]::WriteAllBytes((Join-Path $run 'DMG.GPR'), $damageRoster)
# A resume-state envelope appends bytes after the stable v9 GBSX prefix. It
# remains a direct stream only: the v9 sidecar contract must not be extended.
$damageResume = New-Object byte[] 5920
[Array]::Copy($damageEffect, $damageResume, $damageEffect.Length)
Set-U16 $damageResume 4 14
[IO.File]::WriteAllBytes((Join-Path $run 'DMR.EFX'), $damageResume)
[IO.File]::WriteAllBytes((Join-Path $run 'DMR.GPR'), [byte[]]$roster.Clone())

# A saturated CCECL stream is carried by CCFLOW's same-stem GBSL sibling.
# CCHOST must select that stream instead of the terminal GBSX bridge, validate
# its exact extent before opening the roster, and retain the ordinary DAMAGE
# policy for each source-ordered event.
$damageSideEffect = [byte[]]$damageEffect.Clone()
Set-U16 $damageSideEffect 6 0x0100
$damageSide = New-Object byte[] 62
[Text.Encoding]::ASCII.GetBytes('GBSL').CopyTo($damageSide, 0)
Set-U16 $damageSide 4 1
Set-U16 $damageSide 6 1
[Array]::Copy($damageEffect, 2252, $damageSide, 8, 20)
foreach ($case in @('DMGS','DMGM','DMGT','DMGX','DMGV','DMGL','DMGY','DMGO')) {
  [IO.File]::WriteAllBytes((Join-Path $run "$case.EFX"), [byte[]]$damageSideEffect.Clone())
  [IO.File]::WriteAllBytes((Join-Path $run "$case.GPR"), [byte[]]$roster.Clone())
}
[IO.File]::WriteAllBytes((Join-Path $run 'DMGS.GBS'), [byte[]]$damageSide.Clone())
[IO.File]::WriteAllBytes((Join-Path $run 'DMGT.GBS'), $damageSide[0..60])
$damageSideTrailing = New-Object byte[] 63
[Array]::Copy($damageSide, $damageSideTrailing, 62)
$damageSideTrailing[62] = 0x5a
[IO.File]::WriteAllBytes((Join-Path $run 'DMGX.GBS'), $damageSideTrailing)
$futureTerminal = [byte[]]$damageSideEffect.Clone(); Set-U16 $futureTerminal 4 10
[IO.File]::WriteAllBytes((Join-Path $run 'DMGV.EFX'), $futureTerminal)
[IO.File]::WriteAllBytes((Join-Path $run 'DMGV.GBS'), [byte[]]$damageSide.Clone())
[IO.File]::WriteAllBytes((Join-Path $run 'DMGL.EFX'), $damageSideEffect[0..5748])
[IO.File]::WriteAllBytes((Join-Path $run 'DMGL.GBS'), [byte[]]$damageSide.Clone())
$trailingTerminal = [byte[]]($damageSideEffect + 0x5a)
[IO.File]::WriteAllBytes((Join-Path $run 'DMGY.EFX'), $trailingTerminal)
[IO.File]::WriteAllBytes((Join-Path $run 'DMGY.GBS'), [byte[]]$damageSide.Clone())
# GBSL rows are addressed through a 32-bit offset, so a v1 sidecar may hold any
# u16 row count (see cchost-dqk-damage-test.ps1 L1/L2/L6).  A v2 sidecar keeps
# CCFLOW's SIDE_MAX_RECORDS = 1,213 (its extents are u16): a v2 header with 1,214
# rows must be rejected before the roster opens.  (This case used to be a v1
# 1,214-row stream, pinning the former u16 row-offset wrap guard.)
$damageSideOversized = New-Object byte[] (8 + (1214 * 54))
[Text.Encoding]::ASCII.GetBytes('GBSL').CopyTo($damageSideOversized, 0)
Set-U16 $damageSideOversized 4 2
Set-U16 $damageSideOversized 6 1214
[IO.File]::WriteAllBytes((Join-Path $run 'DMGO.GBS'), $damageSideOversized)

# Two-row v2 stream: a 33-character packed PRINTCLEAR followed by the same
# supported DAMAGE. The valid case must apply once; malformed directory and
# decoded-length controls must fail before opening the roster for mutation.
$damageV2 = New-Object byte[] 162
[Text.Encoding]::ASCII.GetBytes('GBSL').CopyTo($damageV2, 0)
Set-U16 $damageV2 4 2; Set-U16 $damageV2 6 2
Set-U16 $damageV2 8 0x12
Set-U16 $damageV2 28 0xffff
[Text.Encoding]::ASCII.GetBytes('GBPX').CopyTo($damageV2, 30)
[Array]::Copy($damageEffect, 2252, $damageV2, 62, 20)
[Text.Encoding]::ASCII.GetBytes('GBPX').CopyTo($damageV2, 116)
Set-U16 $damageV2 120 1; Set-U16 $damageV2 122 1
Set-U32 $damageV2 124 26
Set-U16 $damageV2 132 26; Set-U16 $damageV2 134 33
for ($i = 0; $i -lt 8; $i++) {
  $damageV2[136 + $i * 3] = 0x04
  $damageV2[137 + $i * 3] = 0x10
  $damageV2[138 + $i * 3] = 0x41
}
$damageV2[160] = 0x04
foreach ($name in @('DMG2', 'DM2B', 'DM2T')) {
  [IO.File]::WriteAllBytes((Join-Path $run "$name.EFX"), [byte[]]$damageSideEffect.Clone())
  [IO.File]::WriteAllBytes((Join-Path $run "$name.GPR"), [byte[]]$roster.Clone())
}
[IO.File]::WriteAllBytes((Join-Path $run 'DMG2.GBS'), $damageV2)
$damageV2BadDir = [byte[]]$damageV2.Clone(); Set-U16 $damageV2BadDir 128 1
[IO.File]::WriteAllBytes((Join-Path $run 'DM2B.GBS'), $damageV2BadDir)
$damageV2BadText = [byte[]]$damageV2.Clone(); Set-U16 $damageV2BadText 134 34
[IO.File]::WriteAllBytes((Join-Path $run 'DM2T.GBS'), $damageV2BadText)

# /T is deliberately opt-in: the exact 16-byte GBDO v1 header is checked
# before the shared fixed/GBSL DAMAGE sink. It is not yet a receipt or a
# token-to-effect binding. Every case gets an independent writable roster.
function New-OperationToken([UInt64]$Generation) {
  $token = New-Object byte[] 16
  [Text.Encoding]::ASCII.GetBytes('GBDO').CopyTo($token, 0)
  Set-U16 $token 4 1; Set-U16 $token 6 1
  [BitConverter]::GetBytes($Generation).CopyTo($token, 8)
  return ,$token
}
$tokenCases = @(
  @{ Name = 'TP1'; Token = (New-OperationToken 1); Pass = $true },
  @{ Name = 'TPH'; Token = (New-OperationToken ([Convert]::ToUInt64('100000000', 16))); Pass = $true },
  @{ Name = 'TPJ'; Token = (New-OperationToken ([Convert]::ToUInt64('1000000000000', 16))); Pass = $true },
  @{ Name = 'TPM'; Token = (New-OperationToken ([UInt64]::MaxValue)); Pass = $true },
  @{ Name = 'TPE'; Token = (New-OperationToken 1); Pass = $true; Sidecar = $true },
  @{ Name = 'TN0'; Token = $null; Pass = $false },
  @{ Name = 'TN1'; Token = [byte[]]@(); Pass = $false },
  @{ Name = 'TN2'; Token = ((New-OperationToken 1)[0..14]); Pass = $false },
  @{ Name = 'TN3'; Token = ([byte[]]((New-OperationToken 1) + 0)); Pass = $false },
  @{ Name = 'TN4'; Token = ([byte[]](0x58,0x42,0x44,0x4f) + (New-OperationToken 1)[4..15]); Pass = $false },
  @{ Name = 'TN5'; Token = ([byte[]]((New-OperationToken 1))); Pass = $false; Offset = 4; Value = 2 },
  @{ Name = 'TN6'; Token = ([byte[]]((New-OperationToken 1))); Pass = $false; Offset = 6; Value = 2 },
  @{ Name = 'TN7'; Token = (New-OperationToken 0); Pass = $false }
)
$tokenExpected = @{}
foreach ($case in $tokenCases) {
  $effectBytes = if ($case.Sidecar) { [byte[]]$damageSideEffect.Clone() } else { [byte[]]$damageEffect.Clone() }
  [IO.File]::WriteAllBytes((Join-Path $run "$($case.Name).EFX"), $effectBytes)
  [IO.File]::WriteAllBytes((Join-Path $run "$($case.Name).GPR"), [byte[]]$roster.Clone())
  if ($case.Sidecar) { [IO.File]::WriteAllBytes((Join-Path $run "$($case.Name).GBS"), [byte[]]$damageSide.Clone()) }
  if ($null -ne $case.Token) {
    $bytes = [byte[]]$case.Token.Clone()
    if ($case.ContainsKey('Offset')) { $bytes[$case.Offset] = $case.Value }
    [IO.File]::WriteAllBytes((Join-Path $run "$($case.Name).DOP"), $bytes)
    $tokenExpected[$case.Name] = [byte[]]$bytes.Clone()
  }
}
foreach ($name in @('TA1','TA2','TA3','TA4','TA5')) {
  [IO.File]::WriteAllBytes((Join-Path $run "$name.EFX"), [byte[]]$damageEffect.Clone())
  [IO.File]::WriteAllBytes((Join-Path $run "$name.GPR"), [byte[]]$roster.Clone())
}
[IO.File]::WriteAllBytes((Join-Path $run 'TA1.DOP'), (New-OperationToken 1))
[IO.File]::WriteAllBytes((Join-Path $run 'TMU.EFX'), [byte[]]$damageEffect.Clone())
[IO.File]::WriteAllBytes((Join-Path $run 'TMU.GPR'), [byte[]]$roster.Clone())
[IO.File]::WriteAllBytes((Join-Path $run 'TMU.DOP'), (New-OperationToken 0))

$request = New-Request 1 'C:\GOOD.GCR' 'C:\GOOD.GPR' 'C:\GOOD.GEF'
[IO.File]::WriteAllBytes((Join-Path $run 'VALID.GHR'), $request)
[IO.File]::WriteAllBytes((Join-Path $run 'TRUNC.GHR'), $request[0..344])
$trailing = New-Object byte[] 347
[Array]::Copy($request, $trailing, 346)
$trailing[346] = 1
[IO.File]::WriteAllBytes((Join-Path $run 'TRAIL.GHR'), $trailing)
$badPadding = [byte[]]$request.Clone()
$badPadding[10 + 13] = 1
[IO.File]::WriteAllBytes((Join-Path $run 'PAD.GHR'), $badPadding)

# The continuation must publish before the persistent roster.  A missing
# effect sink therefore rejects the request without applying its HP/condition
# or XP changes; retrying after the sink is repaired remains safe.
$rngFailRoster = [byte[]]$roster.Clone()
[IO.File]::WriteAllBytes((Join-Path $run 'RNGFAIL.GPR'), $rngFailRoster)
[IO.File]::WriteAllBytes((Join-Path $run 'RNGFAIL.GHR'), (New-Request 1 'C:\GOOD.GCR' 'C:\RNGFAIL.GPR' 'C:\NO.GEF'))

# A CoK GBCR can have a valid v2 header and final RNG but still be missing its
# declared row. CCHOST must reject that body before it writes the RNG into GBEF;
# otherwise a retry would resume from state the rejected combat never earned.
$shortCokResult = $result[0..15]
[IO.File]::WriteAllBytes((Join-Path $run 'SHORTCOK.GCR'), $shortCokResult)
$shortCokRoster = [byte[]]$roster.Clone()
$shortCokEffect = [byte[]]$effect.Clone()
[IO.File]::WriteAllBytes((Join-Path $run 'SHORTCOK.GPR'), $shortCokRoster)
[IO.File]::WriteAllBytes((Join-Path $run 'SHORTCOK.GEF'), $shortCokEffect)
[IO.File]::WriteAllBytes((Join-Path $run 'SHORTCOK.GHR'), (New-Request 1 'C:\SHORTCOK.GCR' 'C:\SHORTCOK.GPR' 'C:\SHORTCOK.GEF'))

# A header-only target used to be accepted as an EOF slot and extended by the
# HP write.  Its rejection must precede both the roster write and CoK's final
# continuation RNG publication.
$shortRoster = $roster[0..15]
$shortRosterEffect = [byte[]]$effect.Clone()
[IO.File]::WriteAllBytes((Join-Path $run 'SHORTROSTER.GPR'), $shortRoster)
[IO.File]::WriteAllBytes((Join-Path $run 'SHORTROSTER.GEF'), $shortRosterEffect)
[IO.File]::WriteAllBytes((Join-Path $run 'SHORTROSTER.GHR'), (New-Request 1 'C:\GOOD.GCR' 'C:\SHORTROSTER.GPR' 'C:\SHORTROSTER.GEF'))

# A nearly complete member used to reach the per-field writes after its short
# slot read.  Its missing last byte must reject before both roster and final
# continuation mutation, just like a header-only body.
$partialRoster = $roster[0..($roster.Length - 2)]
$partialRosterEffect = [byte[]]$effect.Clone()
[IO.File]::WriteAllBytes((Join-Path $run 'PARTIAL.GPR'), $partialRoster)
[IO.File]::WriteAllBytes((Join-Path $run 'PARTIAL.GEF'), $partialRosterEffect)
[IO.File]::WriteAllBytes((Join-Path $run 'PARTIAL.GHR'), (New-Request 1 'C:\GOOD.GCR' 'C:\PARTIAL.GPR' 'C:\PARTIAL.GEF'))

# GBPR has no extension area.  A complete body plus a trailing byte is equally
# invalid, since accepting it would make an unclaimed record writable later.
$trailingRoster = New-Object byte[] ($roster.Length + 1)
[Array]::Copy($roster, $trailingRoster, $roster.Length)
$trailingRoster[$roster.Length] = 0xA5
$trailingRosterEffect = [byte[]]$effect.Clone()
[IO.File]::WriteAllBytes((Join-Path $run 'TRAILROSTER.GPR'), $trailingRoster)
[IO.File]::WriteAllBytes((Join-Path $run 'TRAILROSTER.GEF'), $trailingRosterEffect)
[IO.File]::WriteAllBytes((Join-Path $run 'TRAILROSTER.GHR'), (New-Request 1 'C:\GOOD.GCR' 'C:\TRAILROSTER.GPR' 'C:\TRAILROSTER.GEF'))

# GBCR v1 is the non-CoK contract.  It must receive the exact same structural
# validation as CoK's v2 result before CCHOST opens a writable roster.
$genResult = [byte[]]$result.Clone()
Set-U16 $genResult 4 1
Set-U16 $genResult 12 0
Set-U16 $genResult 14 0
[IO.File]::WriteAllBytes((Join-Path $run 'GEN.GCR'), $genResult)
$genRoster = [byte[]]$roster.Clone()
[IO.File]::WriteAllBytes((Join-Path $run 'GEN.GPR'), $genRoster)
[IO.File]::WriteAllBytes((Join-Path $run 'GEN.GEF'), $effect)
[IO.File]::WriteAllBytes((Join-Path $run 'GEN.GHR'), (New-Request 2 'C:\GEN.GCR' 'C:\GEN.GPR' 'C:\GEN.GEF'))

# A well-formed non-CoK result used to be accepted when it named fewer rows
# than its populated GBPR target; CCHOST then updated only that prefix. Build a
# two-member target, an equal-count control, and both shorter/longer results.
$twoRoster = New-Object byte[] (16 + (2 * 410))
[Array]::Copy($roster, 0, $twoRoster, 0, 16)
Set-U16 $twoRoster 6 2
[Array]::Copy($roster, 16, $twoRoster, 16, 410)
[Array]::Copy($roster, 16, $twoRoster, 16 + 410, 410)
$twoRoster[16 + 410] = 2

function New-GenResult([int]$Count) {
  $new = New-Object byte[] (16 + ($Count * 6))
  [Array]::Copy($genResult, 0, $new, 0, 16)
  Set-U16 $new 10 $Count
  for ($i = 0; $i -lt $Count; $i++) {
    $off = 16 + ($i * 6)
    $new[$off] = [byte]$i
    $new[$off + 1] = 1
    Set-U16 $new ($off + 2) 7
    Set-U16 $new ($off + 4) 10
  }
  return ,$new
}

$genTwoResult = New-GenResult 2
$genThreeResult = New-GenResult 3
foreach ($case in @(
  @{ Name = 'GENSHORT'; Result = $genResult },
  @{ Name = 'GENLONG'; Result = $genThreeResult },
  @{ Name = 'GENEQUAL'; Result = $genTwoResult }
)) {
  $rosterCopy = [byte[]]$twoRoster.Clone()
  $effectCopy = [byte[]]$effect.Clone()
  [IO.File]::WriteAllBytes((Join-Path $run "$($case.Name).GCR"), $case.Result)
  [IO.File]::WriteAllBytes((Join-Path $run "$($case.Name).GPR"), $rosterCopy)
  [IO.File]::WriteAllBytes((Join-Path $run "$($case.Name).GEF"), $effectCopy)
  [IO.File]::WriteAllBytes((Join-Path $run "$($case.Name).GHR"), (New-Request 2 "C:\$($case.Name).GCR" "C:\$($case.Name).GPR" "C:\$($case.Name).GEF"))
}

# Data-only titles can use CCECL's fallback party while their target GBPR is
# empty. That has no writable member, so it remains a valid no-op handoff.
$emptyGenRoster = New-Object byte[] 16
[Array]::Copy($roster, 0, $emptyGenRoster, 0, 16)
Set-U16 $emptyGenRoster 6 0
$emptyGenEffect = [byte[]]$effect.Clone()
[IO.File]::WriteAllBytes((Join-Path $run 'GENEMPTY.GCR'), [byte[]]$genResult.Clone())
[IO.File]::WriteAllBytes((Join-Path $run 'GENEMPTY.GPR'), $emptyGenRoster)
[IO.File]::WriteAllBytes((Join-Path $run 'GENEMPTY.GEF'), $emptyGenEffect)
[IO.File]::WriteAllBytes((Join-Path $run 'GENEMPTY.GHR'), (New-Request 2 'C:\GENEMPTY.GCR' 'C:\GENEMPTY.GPR' 'C:\GENEMPTY.GEF'))

$badGenResult = $genResult[0..15] # count=1 but no six-byte result row
[IO.File]::WriteAllBytes((Join-Path $run 'BAD.GCR'), $badGenResult)
[IO.File]::WriteAllBytes((Join-Path $run 'BAD.GPR'), $genRoster)
[IO.File]::WriteAllBytes((Join-Path $run 'BAD.GEF'), $effect)
[IO.File]::WriteAllBytes((Join-Path $run 'GENBAD.GHR'), (New-Request 2 'C:\BAD.GCR' 'C:\BAD.GPR' 'C:\BAD.GEF'))
[IO.File]::WriteAllBytes((Join-Path $run 'GENMISS.GHR'), (New-Request 2 'C:\NO.GCR' 'C:\BAD.GPR' 'C:\BAD.GEF'))

# The compact flag claims GBD1 metadata for every record.  A bad marker must
# reject the handoff before any sibling is written, rather than silently skip.
$badCompactRoster = [byte[]]$roster.Clone()
Set-U16 $badCompactRoster 10 1
$badCompactEffect = [byte[]]$effect.Clone()
[IO.File]::WriteAllBytes((Join-Path $run 'BADCOMPACT.GPR'), $badCompactRoster)
[IO.File]::WriteAllBytes((Join-Path $run 'BADCOMPACT.GEF'), $badCompactEffect)
[IO.File]::WriteAllBytes((Join-Path $run 'BADCOMPACT.GHR'), (New-Request 2 'C:\GEN.GCR' 'C:\BADCOMPACT.GPR' 'C:\BADCOMPACT.GEF'))

# The preflight must inspect every declared compact member, not only the first.
# Give member one its valid marker and leave member two malformed.
$badCompactSecond = New-Object byte[] (16 + (2 * 410))
[Array]::Copy($roster, 0, $badCompactSecond, 0, 16)
Set-U16 $badCompactSecond 6 2
Set-U16 $badCompactSecond 10 1
[Array]::Copy($roster, 16, $badCompactSecond, 16, 410)
[Array]::Copy($roster, 16, $badCompactSecond, 16 + 410, 410)
[Text.Encoding]::ASCII.GetBytes('GBD1').CopyTo($badCompactSecond, 16 + 1 + 216)
$badCompactSecondEffect = [byte[]]$effect.Clone()
[IO.File]::WriteAllBytes((Join-Path $run 'BADCOMP2.GPR'), $badCompactSecond)
[IO.File]::WriteAllBytes((Join-Path $run 'BADCOMP2.GEF'), $badCompactSecondEffect)
[IO.File]::WriteAllBytes((Join-Path $run 'BADCOMP2.GHR'), (New-Request 2 'C:\GEN.GCR' 'C:\BADCOMP2.GPR' 'C:\BADCOMP2.GEF'))

# Compact DoK records carry the raw .GAM fields followed by GBD1 cache data.
# A combat victory splits GBCR's derived XP by each member's active class slots,
# carries u32 XP, and refreshes readiness from that member's cached threshold.
$dokRoster = New-Object byte[] (16 + (2 * 410))
[Text.Encoding]::ASCII.GetBytes('GBPR').CopyTo($dokRoster, 0)
Set-U16 $dokRoster 4 2
Set-U16 $dokRoster 6 2
Set-U16 $dokRoster 8 410
Set-U16 $dokRoster 10 1
Set-U16 $dokRoster 12 2
Set-U16 $dokRoster 14 1
for ($i = 0; $i -lt 2; $i++) {
  $off = 16 + ($i * 410)
  $dokRoster[$off] = [byte]($i + 1)
  [Text.Encoding]::ASCII.GetBytes('GBD1').CopyTo($dokRoster, $off + 1 + 216)
  Set-U16 $dokRoster ($off + 1 + 216 + 4) 5
  Set-U16 $dokRoster ($off + 1 + 216 + 6) 20
  Set-U16 $dokRoster ($off + 1 + 216 + 26) 20
  $dokRoster[$off + 1 + 0x45] = 1
}
# Member 1 has one active class and crosses 4 after 10 XP wraps FFFFFFFA -> 4.
Set-U32 $dokRoster (16 + 1 + 0x62) ([uint32]::MaxValue - 5)
Set-U32 $dokRoster (16 + 1 + 216 + 28) 4
# Member 2 has two active classes, receives floor(10/2), and remains below 200.
$dokRoster[16 + 410 + 1 + 0x46] = 1
Set-U32 $dokRoster (16 + 410 + 1 + 0x62) 100
Set-U32 $dokRoster (16 + 410 + 1 + 216 + 28) 200
# Original low-numbered compact slots must receive the same award fields.  A
# later CCPARTY /G cold load reads these raw .GAM bytes rather than GBPR.
New-Item -ItemType Directory -Force (Join-Path $run 'SAVE') | Out-Null
for ($i = 0; $i -lt 2; $i++) {
  $raw = New-Object byte[] 216
  [Array]::Copy($dokRoster, 16 + ($i * 410) + 1, $raw, 0, 216)
  $raw[40] = 93
  $raw[214] = 20
  [IO.File]::WriteAllBytes((Join-Path $run "SAVE\CHRDATA$($i + 1).GAM"), $raw)
}
# Direct ECL DAMAGE must use the compact DoK current-HP cache and update only
# retail byte 214. Byte 40 starts distinct so a maximum-HP write is visible.
$dokDamageRoster = [byte[]]$dokRoster.Clone()
# Both combat and DAMAGE mutations inherit explicit v2 DoK identity.
Set-U16 $dokDamageRoster (16 + 1 + 216 + 26) 93
[IO.File]::WriteAllBytes((Join-Path $run 'DMD.GPR'), $dokDamageRoster)
[IO.File]::WriteAllBytes((Join-Path $run 'DMD.EFX'), [byte[]]$damageEffect.Clone())
# Legacy compact headers are recoverable from old journals, but cannot
# authorize a fresh combat or DAMAGE mutation without title identity.
$dokLegacyRoster = [byte[]]$dokDamageRoster.Clone()
Set-U16 $dokLegacyRoster 4 1
Set-U32 $dokLegacyRoster 12 0
[IO.File]::WriteAllBytes((Join-Path $run 'DMLEG.GPR'), $dokLegacyRoster)
[IO.File]::WriteAllBytes((Join-Path $run 'DMLEG.EFX'), $damageEffect)
[IO.File]::WriteAllBytes((Join-Path $run 'DMLEG.GCR'), $genTwoResult)
[IO.File]::WriteAllBytes((Join-Path $run 'DMLEG.GEF'), $effect)
[IO.File]::WriteAllBytes((Join-Path $run 'DMLEG.GHR'), (New-Request 2 'C:\DMLEG.GCR' 'C:\DMLEG.GPR' 'C:\DMLEG.GEF'))
# `/D` must validate the complete writable roster before changing the first
# compact record or its retail source. Exercise all three body failures with
# a two-member DoK roster: short, trailing, and a malformed later GBD1 marker.
$dokDamageShort = New-Object byte[] ($dokDamageRoster.Length - 1)
[Array]::Copy($dokDamageRoster, $dokDamageShort, $dokDamageShort.Length)
[IO.File]::WriteAllBytes((Join-Path $run 'DMTR.GPR'), $dokDamageShort)
[IO.File]::WriteAllBytes((Join-Path $run 'DMTR.EFX'), [byte[]]$damageEffect.Clone())
$dokDamageTrailing = New-Object byte[] ($dokDamageRoster.Length + 1)
[Array]::Copy($dokDamageRoster, $dokDamageTrailing, $dokDamageRoster.Length)
$dokDamageTrailing[$dokDamageRoster.Length] = 0x5a
[IO.File]::WriteAllBytes((Join-Path $run 'DMTA.GPR'), $dokDamageTrailing)
[IO.File]::WriteAllBytes((Join-Path $run 'DMTA.EFX'), [byte[]]$damageEffect.Clone())
$dokDamageBadSecond = [byte[]]$dokDamageRoster.Clone()
[Array]::Clear($dokDamageBadSecond, 16 + 410 + 1 + 216, 4)
[IO.File]::WriteAllBytes((Join-Path $run 'DMBD.GPR'), $dokDamageBadSecond)
[IO.File]::WriteAllBytes((Join-Path $run 'DMBD.EFX'), [byte[]]$damageEffect.Clone())
# Two selected DAMAGE records expose stream-level atomicity: target 1 is valid,
# but target 2 loses its retail source.  `/D` must reject before either record
# mutates. Run the same ordered records through direct GBSX and GBSL sidecar.
$damageMultiEffect = [byte[]]$damageEffect.Clone()
Set-U16 $damageMultiEffect 2250 2
for ($i = 0; $i -lt 2; $i++) {
  $off = 2252 + ($i * 20)
  Set-U16 $damageMultiEffect ($off + 0) 0x2e
  Set-U16 $damageMultiEffect ($off + 2) 7
  Set-U16 $damageMultiEffect ($off + 4) 0x80
  Set-U16 $damageMultiEffect ($off + 6) 1
  Set-U16 $damageMultiEffect ($off + 8) 2
  Set-U16 $damageMultiEffect ($off + 10) 1
  Set-U16 $damageMultiEffect ($off + 12) 0x80
  Set-U16 $damageMultiEffect ($off + 14) 1
  Set-U16 $damageMultiEffect ($off + 16) ($i + 1)
}
[IO.File]::WriteAllBytes((Join-Path $run 'DMP.EFX'), $damageMultiEffect)
[IO.File]::WriteAllBytes((Join-Path $run 'DMP.GPR'), [byte[]]$dokDamageRoster.Clone())
[IO.File]::WriteAllBytes((Join-Path $run 'DMWR.EFX'), [byte[]]$damageEffect.Clone())
[IO.File]::WriteAllBytes((Join-Path $run 'DMWR.GPR'), [byte[]]$dokDamageRoster.Clone())
$damageMultiSideEffect = [byte[]]$damageSideEffect.Clone()
[IO.File]::WriteAllBytes((Join-Path $run 'DPS.EFX'), $damageMultiSideEffect)
[IO.File]::WriteAllBytes((Join-Path $run 'DPS.GPR'), [byte[]]$dokDamageRoster.Clone())
$damageMultiSide = New-Object byte[] (8 + (2 * 54))
[Text.Encoding]::ASCII.GetBytes('GBSL').CopyTo($damageMultiSide, 0)
Set-U16 $damageMultiSide 4 1
Set-U16 $damageMultiSide 6 2
for ($i = 0; $i -lt 2; $i++) {
  [Array]::Copy($damageMultiEffect, 2252 + ($i * 20), $damageMultiSide, 8 + ($i * 54), 20)
}
[IO.File]::WriteAllBytes((Join-Path $run 'DPS.GBS'), $damageMultiSide)
# A direct DAMAGE sink is source-authoritative for every low-numbered compact
# member.  This control removes member 2's retail source after the snapshot;
# CCHOST must reject before it can update member 1's GBPR or source bytes.
[IO.File]::WriteAllBytes((Join-Path $run 'DMM.GPR'), [byte[]]$dokDamageRoster.Clone())
[IO.File]::WriteAllBytes((Join-Path $run 'DMM.EFX'), [byte[]]$damageEffect.Clone())
# High-bit source slots are the one native-only exception: they have compact
# state but deliberately do not claim a retail CHRDATA#.GAM companion.
$dokSourceLessRoster = [byte[]]$dokDamageRoster.Clone()
for ($i = 0; $i -lt 2; $i++) { $dokSourceLessRoster[16 + ($i * 410)] = 0x80 + $i }
[IO.File]::WriteAllBytes((Join-Path $run 'DMS.GPR'), $dokSourceLessRoster)
[IO.File]::WriteAllBytes((Join-Path $run 'DMS.EFX'), [byte[]]$damageEffect.Clone())
$lossResult = [byte[]]$genTwoResult.Clone()
Set-U16 $lossResult 6 1
$fleeResult = [byte[]]$genTwoResult.Clone()
Set-U16 $fleeResult 6 3
foreach ($case in @(
  @{ Name = 'DOKWIN'; Result = $genTwoResult },
  @{ Name = 'DOKLOSS'; Result = $lossResult },
  @{ Name = 'DOKFLEE'; Result = $fleeResult }
)) {
  [IO.File]::WriteAllBytes((Join-Path $run "$($case.Name).GCR"), $case.Result)
  [IO.File]::WriteAllBytes((Join-Path $run "$($case.Name).GPR"), [byte[]]$dokRoster.Clone())
  [IO.File]::WriteAllBytes((Join-Path $run "$($case.Name).GEF"), [byte[]]$effect.Clone())
  [IO.File]::WriteAllBytes((Join-Path $run "$($case.Name).GHR"), (New-Request 2 "C:\$($case.Name).GCR" "C:\$($case.Name).GPR" "C:\$($case.Name).GEF"))
}

# GBCR v1 offset 12 is reserved for an optional DoK Cast receipt: low byte is
# the party-result ordinal, high byte is raw spell id.  Supply a real-shaped
# fixed 220-byte WIZ sidecar with one right-justified Magic Missile (raw id 15)
# and prove CCHOST consumes that one prepared instance after the complete
# roster/.GAM handoff.  The missing-sidecar retry must fail before its roster
# moves, so a Cast cannot be invented from an absent source record.
$dokCastResult = [byte[]]$genTwoResult.Clone()
Set-U16 $dokCastResult 12 0x0f00
$dokCastRoster = [byte[]]$dokRoster.Clone()
$dokCastEffect = [byte[]]$effect.Clone()
$dokCastWiz = New-Object byte[] 220
$dokCastWiz[73] = 15
[IO.File]::WriteAllBytes((Join-Path $run 'SAVE\CHRDATA1.WIZ'), $dokCastWiz)
[IO.File]::WriteAllBytes((Join-Path $run 'DOKCAST.GCR'), $dokCastResult)
[IO.File]::WriteAllBytes((Join-Path $run 'DOKCAST.GPR'), $dokCastRoster)
[IO.File]::WriteAllBytes((Join-Path $run 'DOKCAST.GEF'), $dokCastEffect)
[IO.File]::WriteAllBytes((Join-Path $run 'DOKCAST.GHR'), (New-Request 2 'C:\DOKCAST.GCR' 'C:\DOKCAST.GPR' 'C:\DOKCAST.GEF'))
$dokCastBadRoster = [byte[]]$dokRoster.Clone()
[IO.File]::WriteAllBytes((Join-Path $run 'DOKCASTBAD.GCR'), [byte[]]$dokCastResult.Clone())
[IO.File]::WriteAllBytes((Join-Path $run 'DOKCASTBAD.GPR'), $dokCastBadRoster)
[IO.File]::WriteAllBytes((Join-Path $run 'DOKCASTBAD.GEF'), [byte[]]$effect.Clone())
[IO.File]::WriteAllBytes((Join-Path $run 'DOKCASTBAD.GHR'), (New-Request 2 'C:\DOKCASTBAD.GCR' 'C:\DOKCASTBAD.GPR' 'C:\DOKCASTBAD.GEF'))

# The final consumed-bit write is after GBPR, raw .GAM, and the Cast's WIZ
# sidecar. Build a separate Cast handoff so a test-only failure at that exact
# write can prove the next ordinary CCHOST process finalizes the same result
# without replaying its additive XP or consuming another spell.
$dokTxResult = [byte[]]$genTwoResult.Clone()
Set-U16 $dokTxResult 12 0x0f00
$dokTxWiz = New-Object byte[] 220
$dokTxWiz[73] = 15
[IO.File]::WriteAllBytes((Join-Path $run 'DOKTX.GCR'), $dokTxResult)
[IO.File]::WriteAllBytes((Join-Path $run 'DOKTX.GPR'), [byte[]]$dokRoster.Clone())
[IO.File]::WriteAllBytes((Join-Path $run 'DOKTX.GEF'), [byte[]]$effect.Clone())
[IO.File]::WriteAllBytes((Join-Path $run 'DOKTX.GHR'), (New-Request 2 'C:\DOKTX.GCR' 'C:\DOKTX.GPR' 'C:\DOKTX.GEF'))
[IO.File]::WriteAllBytes((Join-Path $run 'DOKTX.WIZ'), $dokTxWiz)

# A separate fault stops immediately before FINALIZING.  The next normal
# process must restore the old GPR/.GAM/WIZ preimage first, then apply the
# original result once; this covers a failed write before the receipt stage.
$dokRollbackResult = [byte[]]$genTwoResult.Clone()
Set-U16 $dokRollbackResult 12 0x0f00
[IO.File]::WriteAllBytes((Join-Path $run 'DOKRB.GCR'), $dokRollbackResult)
[IO.File]::WriteAllBytes((Join-Path $run 'DOKRB.GPR'), [byte[]]$dokRoster.Clone())
[IO.File]::WriteAllBytes((Join-Path $run 'DOKRB.GEF'), [byte[]]$effect.Clone())
[IO.File]::WriteAllBytes((Join-Path $run 'DOKRB.GHR'), (New-Request 2 'C:\DOKRB.GCR' 'C:\DOKRB.GPR' 'C:\DOKRB.GEF'))
[IO.File]::WriteAllBytes((Join-Path $run 'DOKRB.WIZ'), [byte[]]$dokTxWiz.Clone())
for ($i = 0; $i -lt 2; $i++) {
  $raw = New-Object byte[] 216
  [Array]::Copy($dokRoster, 16 + ($i * 410) + 1, $raw, 0, 216)
  [IO.File]::WriteAllBytes((Join-Path $run "DOKRB$($i + 1).GAM"), $raw)
}
# A Gen1 source save is independent of its GBPR mirror.  The prepared-state
# fault mutates it before stopping; recovery must restore these raw source bytes,
# not reconstruct them from the roster's condition/HP/XP fields.
$genRollbackSave = New-Object byte[] 500
$genRollbackSave[392] = 0
$genRollbackSave[407] = 33
Set-U32 $genRollbackSave 278 0x12345678
[IO.File]::WriteAllBytes((Join-Path $run 'GENRB.SAV'), $genRollbackSave)
[IO.File]::WriteAllBytes((Join-Path $run 'GENRB.GCR'), [byte[]]$genResult.Clone())
[IO.File]::WriteAllBytes((Join-Path $run 'GENRB.GPR'), [byte[]]$genRoster.Clone())
[IO.File]::WriteAllBytes((Join-Path $run 'GENRB.GEF'), [byte[]]$effect.Clone())
[IO.File]::WriteAllBytes((Join-Path $run 'GENRB.GHR'), (New-Request 2 'C:\GENRB.GCR' 'C:\GENRB.GPR' 'C:\GENRB.GEF'))

$dokNoCache = [byte[]]$dokRoster.Clone()
Set-U16 $dokNoCache (16 + 1 + 216 + 4) 1
[IO.File]::WriteAllBytes((Join-Path $run 'DOKNOC.GCR'), [byte[]]$genTwoResult.Clone())
[IO.File]::WriteAllBytes((Join-Path $run 'DOKNOC.GPR'), $dokNoCache)
[IO.File]::WriteAllBytes((Join-Path $run 'DOKNOC.GEF'), [byte[]]$effect.Clone())
[IO.File]::WriteAllBytes((Join-Path $run 'DOKNOC.GHR'), (New-Request 2 'C:\DOKNOC.GCR' 'C:\DOKNOC.GPR' 'C:\DOKNOC.GEF'))

# Data-only GLIB/HLIB probes run with CCCOMBAT's ephemeral fallback party.
# Their structurally valid result has no GBPR sink, while a malformed result
# must still be rejected before that mode's no-op handoff can complete.
[IO.File]::WriteAllBytes((Join-Path $run 'OTHER.GCR'), [byte[]]$genResult.Clone())
[IO.File]::WriteAllBytes((Join-Path $run 'OTHER.GHR'), (New-Request 3 'C:\OTHER.GCR' 'C:\NONE.GPR' 'C:\NONE.GEF'))
[IO.File]::WriteAllBytes((Join-Path $run 'OTHERBAD.GHR'), (New-Request 3 'C:\BAD.GCR' 'C:\NONE.GPR' 'C:\NONE.GEF'))

$damageMalformedBatch = @'
copy C:\DMTR.GPR C:\DMTR.PRE > nul
copy C:\SAVE\CHRDATA1.GAM C:\DMTR1.PRE > nul
copy C:\SAVE\CHRDATA2.GAM C:\DMTR2.PRE > nul
CCHOST /D C:\DMTR.EFX C:\DMTR.GPR > C:\DMTR.LOG
copy C:\DMTR.GPR C:\DMTR.OUT > nul
copy C:\SAVE\CHRDATA1.GAM C:\DMTR1.OUT > nul
copy C:\SAVE\CHRDATA2.GAM C:\DMTR2.OUT > nul
copy C:\DMTA.GPR C:\DMTA.PRE > nul
copy C:\SAVE\CHRDATA1.GAM C:\DMTA1.PRE > nul
copy C:\SAVE\CHRDATA2.GAM C:\DMTA2.PRE > nul
CCHOST /D C:\DMTA.EFX C:\DMTA.GPR > C:\DMTA.LOG
copy C:\DMTA.GPR C:\DMTA.OUT > nul
copy C:\SAVE\CHRDATA1.GAM C:\DMTA1.OUT > nul
copy C:\SAVE\CHRDATA2.GAM C:\DMTA2.OUT > nul
copy C:\DMBD.GPR C:\DMBD.PRE > nul
copy C:\SAVE\CHRDATA1.GAM C:\DMBD1.PRE > nul
copy C:\SAVE\CHRDATA2.GAM C:\DMBD2.PRE > nul
CCHOST /D C:\DMBD.EFX C:\DMBD.GPR > C:\DMBD.LOG
copy C:\DMBD.GPR C:\DMBD.OUT > nul
copy C:\SAVE\CHRDATA1.GAM C:\DMBD1.OUT > nul
copy C:\SAVE\CHRDATA2.GAM C:\DMBD2.OUT > nul
copy C:\DMP.GPR C:\DMP.PRE > nul
copy C:\SAVE\CHRDATA1.GAM C:\DMP1.PRE > nul
copy C:\SAVE\CHRDATA2.GAM C:\DMP2.PRE > nul
del C:\SAVE\CHRDATA2.GAM
CCHOST /D C:\DMP.EFX C:\DMP.GPR > C:\DMP.LOG
copy C:\DMP.GPR C:\DMP.OUT > nul
copy C:\SAVE\CHRDATA1.GAM C:\DMP1.OUT > nul
copy C:\DMP2.PRE C:\SAVE\CHRDATA2.GAM > nul
copy C:\DPS.GPR C:\DPS.PRE > nul
copy C:\SAVE\CHRDATA1.GAM C:\DPS1.PRE > nul
copy C:\SAVE\CHRDATA2.GAM C:\DPS2.PRE > nul
del C:\SAVE\CHRDATA2.GAM
CCHOST /D C:\DPS.EFX C:\DPS.GPR > C:\DPS.LOG
copy C:\DPS.GPR C:\DPS.OUT > nul
copy C:\SAVE\CHRDATA1.GAM C:\DPS1.OUT > nul
copy C:\DPS2.PRE C:\SAVE\CHRDATA2.GAM > nul
copy C:\DMP.GPR C:\DMWP.PRE > nul
copy C:\SAVE\CHRDATA1.GAM C:\DMWP1.PRE > nul
copy C:\SAVE\CHRDATA2.GAM C:\DMWP2.PRE > nul
copy C:\CCHOST.PFL C:\CCHOST.COM > nul
CCHOST /D C:\DMP.EFX C:\DMP.GPR > C:\DMWP.LOG
copy C:\DMP.GPR C:\DMWP.OUT > nul
copy C:\SAVE\CHRDATA1.GAM C:\DMWP1.OUT > nul
copy C:\SAVE\CHRDATA2.GAM C:\DMWP2.OUT > nul
copy C:\DPS.GPR C:\DMWS.PRE > nul
copy C:\SAVE\CHRDATA1.GAM C:\DMWS1.PRE > nul
copy C:\SAVE\CHRDATA2.GAM C:\DMWS2.PRE > nul
CCHOST /D C:\DPS.EFX C:\DPS.GPR > C:\DMWS.LOG
copy C:\DPS.GPR C:\DMWS.OUT > nul
copy C:\SAVE\CHRDATA1.GAM C:\DMWS1.OUT > nul
copy C:\SAVE\CHRDATA2.GAM C:\DMWS2.OUT > nul
copy C:\CCHOST.WPF C:\CCHOST.COM > nul
CCHOST /D C:\DMWR.EFX C:\DMWR.GPR > C:\DMWR.LOG
copy C:\CCHOST.OK C:\CCHOST.COM > nul
'@
[IO.File]::WriteAllText((Join-Path $run 'DMCHK.BAT'), $damageMalformedBatch, [Text.Encoding]::ASCII)

$tokenBatch = [Text.StringBuilder]::new()
function Add-TokenCommand([string]$Name, [string]$Command) {
  [void]$tokenBatch.AppendLine("$Command > C:\$Name.LOG")
  [void]$tokenBatch.AppendLine("if errorlevel 1 goto $Name`_bad")
  [void]$tokenBatch.AppendLine("echo OK>C:\$Name.STA")
  [void]$tokenBatch.AppendLine("goto $Name`_done")
  [void]$tokenBatch.AppendLine(":$Name`_bad")
  [void]$tokenBatch.AppendLine("echo BAD>C:\$Name.STA")
  [void]$tokenBatch.AppendLine(":$Name`_done")
}
foreach ($case in $tokenCases) {
  Add-TokenCommand $case.Name "CCHOST /D C:\$($case.Name).EFX C:\$($case.Name).GPR /T C:\$($case.Name).DOP"
}
Add-TokenCommand 'TA1' 'CCHOST /D C:\TA1.EFX C:\TA1.GPR /T'
Add-TokenCommand 'TA2' 'CCHOST /D C:\TA2.EFX C:\TA2.GPR /TNO'
Add-TokenCommand 'TA3' 'CCHOST /D C:\TA3.EFX C:\TA3.GPR /Q C:\TA1.DOP'
Add-TokenCommand 'TA4' 'CCHOST /D C:\TA4.EFX C:\TA4.GPR /T C:\TA1.DOP /T C:\TA1.DOP'
Add-TokenCommand 'TA5' 'CCHOST /D C:\TA5.EFX C:\TA5.GPR /T C:\TA1.DOP EXTRA'
Add-TokenCommand 'TAH' 'CCHOST /H C:\VALID.GHR /T C:\TA1.DOP'
[IO.File]::WriteAllText((Join-Path $run 'TOKCHK.BAT'), $tokenBatch.ToString(), [Text.Encoding]::ASCII)
[IO.File]::WriteAllText((Join-Path $run 'MUTCHK.BAT'), @'
copy C:\CCHOST.TBP C:\CCHOST.COM > nul
CCHOST /D C:\TMU.EFX C:\TMU.GPR /T C:\TMU.DOP > C:\TMU.LOG
if errorlevel 1 goto bad
echo OK>C:\TMU.STA
goto done
:bad
echo BAD>C:\TMU.STA
:done
copy C:\CCHOST.OK C:\CCHOST.COM > nul
'@, [Text.Encoding]::ASCII)

$conf = Join-Path $run '_cchost.conf'
# Keep the command list in a disk batch: DOSBox 0.74's synthesized AUTOEXEC
# has a bounded buffer, which these contract cases can exceed.
@"
CCHOST /D C:\DMG.EFX C:\DMG.GPR > C:\DMG.LOG
CCHOST /D C:\DMR.EFX C:\DMR.GPR > C:\DMR.LOG
CCHOST /D C:\DMGS.EFX C:\DMGS.GPR > C:\DMGS.LOG
CCHOST /D C:\DMG2.EFX C:\DMG2.GPR > C:\DMG2.LOG
CCHOST /D C:\DM2B.EFX C:\DM2B.GPR > C:\DM2B.LOG
CCHOST /D C:\DM2T.EFX C:\DM2T.GPR > C:\DM2T.LOG
CCHOST /D C:\DMGM.EFX C:\DMGM.GPR > C:\DMGM.LOG
CCHOST /D C:\DMGT.EFX C:\DMGT.GPR > C:\DMGT.LOG
CCHOST /D C:\DMGX.EFX C:\DMGX.GPR > C:\DMGX.LOG
CCHOST /D C:\DMGV.EFX C:\DMGV.GPR > C:\DMGV.LOG
CCHOST /D C:\DMGL.EFX C:\DMGL.GPR > C:\DMGL.LOG
CCHOST /D C:\DMGY.EFX C:\DMGY.GPR > C:\DMGY.LOG
CCHOST /D C:\DMGO.EFX C:\DMGO.GPR > C:\DMGO.LOG
call C:\DMCHK.BAT
call C:\TOKCHK.BAT
call C:\MUTCHK.BAT
copy C:\SAVE\CHRDATA1.GAM C:\DMLEG1.PRE > nul
copy C:\SAVE\CHRDATA2.GAM C:\DMLEG2.PRE > nul
CCHOST /D C:\DMLEG.EFX C:\DMLEG.GPR > C:\DMLEG.LOG
CCHOST /H C:\DMLEG.GHR > C:\DHLEG.LOG
copy C:\SAVE\CHRDATA1.GAM C:\DMLEG1.OUT > nul
copy C:\SAVE\CHRDATA2.GAM C:\DMLEG2.OUT > nul
CCHOST /D C:\DMD.EFX C:\DMD.GPR > C:\DMD.LOG
copy C:\SAVE\CHRDATA1.GAM C:\DMD.OUT > nul
copy C:\DMM.GPR C:\DMM.PRE > nul
copy C:\SAVE\CHRDATA1.GAM C:\DMM1.PRE > nul
copy C:\SAVE\CHRDATA2.GAM C:\DMM2.PRE > nul
del C:\SAVE\CHRDATA2.GAM
CCHOST /D C:\DMM.EFX C:\DMM.GPR > C:\DMM.LOG
copy C:\DMM.GPR C:\DMM.OUT > nul
copy C:\SAVE\CHRDATA1.GAM C:\DMM1.OUT > nul
copy C:\DMM2.PRE C:\SAVE\CHRDATA2.GAM > nul
del C:\SAVE\CHRDATA1.GAM
del C:\SAVE\CHRDATA2.GAM
CCHOST /D C:\DMS.EFX C:\DMS.GPR > C:\DMS.LOG
copy C:\DMS.GPR C:\DMS.OUT > nul
copy C:\DMM1.PRE C:\SAVE\CHRDATA1.GAM > nul
copy C:\DMM2.PRE C:\SAVE\CHRDATA2.GAM > nul
CCHOST /H C:\VALID.GHR > C:\VALID.LOG
CCHOST /H C:\TRUNC.GHR > C:\TRUNC.LOG
CCHOST /H C:\TRAIL.GHR > C:\TRAIL.LOG
CCHOST /H C:\PAD.GHR > C:\PAD.LOG
CCHOST /H C:\RNGFAIL.GHR > C:\RNGFAIL.LOG
CCHOST /H C:\SHORTCOK.GHR > C:\SHORTCOK.LOG
CCHOST /H C:\SHORTROSTER.GHR > C:\SROSTER.LOG
CCHOST /H C:\PARTIAL.GHR > C:\PROSTER.LOG
CCHOST /H C:\TRAILROSTER.GHR > C:\TROSTER.LOG
CCHOST /H C:\GEN.GHR > C:\GEN.LOG
CCHOST /H C:\GENSHORT.GHR > C:\GENSHORT.LOG
CCHOST /H C:\GENLONG.GHR > C:\GENLONG.LOG
CCHOST /H C:\GENEQUAL.GHR > C:\GENEQUAL.LOG
CCHOST /H C:\GENEMPTY.GHR > C:\GENEMPTY.LOG
CCHOST /H C:\GENBAD.GHR > C:\GENBAD.LOG
CCHOST /H C:\GENMISS.GHR > C:\GENMISS.LOG
CCHOST /H C:\BADCOMPACT.GHR > C:\BCOMPACT.LOG
CCHOST /H C:\BADCOMP2.GHR > C:\BCOMP2.LOG
CCHOST /H C:\DOKWIN.GHR > C:\DOKWIN.LOG
CCHOST /H C:\DOKLOSS.GHR > C:\DOKLOSS.LOG
CCHOST /H C:\DOKFLEE.GHR > C:\DOKFLEE.LOG
CCHOST /H C:\DOKNOC.GHR > C:\DOKNOC.LOG
CCHOST /H C:\DOKWIN.GHR > C:\DOKRP.LOG
CCHOST /H C:\DOKCAST.GHR > C:\DOKCAST.LOG
copy C:\SAVE\CHRDATA1.WIZ C:\DOKCAST.WIZ > nul
del C:\SAVE\CHRDATA1.WIZ
CCHOST /H C:\DOKCASTBAD.GHR > C:\DOKCASTB.LOG
copy C:\DOKTX.WIZ C:\SAVE\CHRDATA1.WIZ > nul
copy C:\CCHOST.FLT C:\CCHOST.COM > nul
CCHOST /H C:\DOKTX.GHR > C:\DOKTXF.LOG
copy C:\CCHOST.OK C:\CCHOST.COM > nul
CCHOST /H C:\DOKTX.GHR > C:\DOKTXR.LOG
copy C:\SAVE\CHRDATA1.WIZ C:\DOKTX.OUT > nul
del C:\SAVE\CHRDATA1.WIZ
copy C:\DOKRB.WIZ C:\SAVE\CHRDATA1.WIZ > nul
copy C:\DOKRB1.GAM C:\SAVE\CHRDATA1.GAM > nul
copy C:\DOKRB2.GAM C:\SAVE\CHRDATA2.GAM > nul
copy C:\CCHOST.PRP C:\CCHOST.COM > nul
CCHOST /H C:\DOKRB.GHR > C:\DOKRBF.LOG
copy C:\CCHOST.RCV C:\CCHOST.COM > nul
CCHOST /H C:\DOKRB.GHR > C:\DOKRBS.LOG
copy C:\DOKRB.GPR C:\DOKRB.PRE > nul
copy C:\DOKRB.GCR C:\DOKRB.GC0 > nul
copy C:\SAVE\CHRDATA1.GAM C:\DOKRB1.OUT > nul
copy C:\SAVE\CHRDATA2.GAM C:\DOKRB2.OUT > nul
copy C:\SAVE\CHRDATA1.WIZ C:\DOKRB.WIN > nul
copy C:\CCHOST.OK C:\CCHOST.COM > nul
CCHOST /H C:\DOKRB.GHR > C:\DOKRBR.LOG
copy C:\SAVE\CHRDATA1.WIZ C:\DOKRB.OUT > nul
del C:\SAVE\CHRDATA1.WIZ
copy C:\GENRB.SAV C:\SAVE\CHRDATA1.SAV > nul
copy C:\CCHOST.PRP C:\CCHOST.COM > nul
CCHOST /H C:\GENRB.GHR > C:\GENRBF.LOG
copy C:\CCHOST.RCV C:\CCHOST.COM > nul
CCHOST /H C:\GENRB.GHR > C:\GENRBS.LOG
copy C:\SAVE\CHRDATA1.SAV C:\GENRB.OUT > nul
copy C:\CCHOST.OK C:\CCHOST.COM > nul
CCHOST /H C:\GENRB.GHR > C:\GENRBR.LOG
copy C:\SAVE\CHRDATA1.SAV C:\GENRB.FIN > nul
CCHOST /H C:\OTHER.GHR > C:\OTHER.LOG
CCHOST /H C:\OTHERBAD.GHR > C:\OTHERBAD.LOG
exit
"@ | Set-Content -Path (Join-Path $run 'RUN.BAT') -Encoding ASCII
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[autoexec]
mount C "$run"
C:
call C:\RUN.BAT
"@ | Set-Content -Path $conf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-DosBoxSmoke -Process $p
  throw 'DOSBox did not exit while running CCHOST contract smoke'
}
if ((Get-Content (Join-Path $run 'DMG.LOG') -Raw) -notlike '*CCHOST: effect damage applied*' -or [IO.File]::ReadAllBytes((Join-Path $run 'DMG.GPR'))[424] -ne 17) {
  throw 'CCHOST /D did not apply the supported automatic DAMAGE exactly once'
}
if ((Get-Content (Join-Path $run 'DMR.LOG') -Raw) -notlike '*CCHOST: effect damage applied*' -or [IO.File]::ReadAllBytes((Join-Path $run 'DMR.GPR'))[424] -ne 17) {
  throw 'CCHOST /D did not apply the v14 fixed DAMAGE prefix exactly once'
}
if ((Get-Content (Join-Path $run 'DMGS.LOG') -Raw) -notlike '*CCHOST: effect damage applied*' -or [IO.File]::ReadAllBytes((Join-Path $run 'DMGS.GPR'))[424] -ne 17) {
  throw 'CCHOST /D did not stream the validated GBSL DAMAGE exactly once'
}
if ((Get-Content (Join-Path $run 'DMG2.LOG') -Raw) -notlike '*CCHOST: effect damage applied*' -or
    [IO.File]::ReadAllBytes((Join-Path $run 'DMG2.GPR'))[424] -ne 17) {
  throw 'CCHOST /D did not apply the v2 GBSL DAMAGE exactly once'
}
foreach ($case in $tokenCases) {
  $name = $case.Name
  $status = (Get-Content (Join-Path $run "$name.STA") -Raw).Trim()
  $log = Get-Content (Join-Path $run "$name.LOG") -Raw
  $expectedEffect = if ($case.Sidecar) { $damageSideEffect } else { $damageEffect }
  if ([BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run "$name.EFX"))) -ne [BitConverter]::ToString($expectedEffect)) {
    throw "CCHOST changed direct-DAMAGE effect $name while validating /T"
  }
  if ($case.Pass) {
    if ($status -ne 'OK' -or $log -notlike '*CCHOST: effect damage applied*' -or
        [IO.File]::ReadAllBytes((Join-Path $run "$name.GPR"))[424] -ne 17) {
      throw "CCHOST rejected a valid /T operation token $name"
    }
    if ([BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run "$name.DOP"))) -ne [BitConverter]::ToString($tokenExpected[$name])) {
      throw "CCHOST changed valid /T operation token $name"
    }
    if ($case.Sidecar -and [BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run "$name.GBS"))) -ne [BitConverter]::ToString($damageSide)) {
      throw 'CCHOST changed a GBSL sidecar while applying token-bearing DAMAGE'
    }
  } else {
    if ($status -ne 'BAD' -or $log -notlike '*CCHOST: invalid host request*' -or $log -like '*CCHOST: effect damage applied*') {
      throw "CCHOST accepted malformed /T operation token $name"
    }
    if ([BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run "$name.GPR"))) -ne [BitConverter]::ToString($roster)) {
      throw "CCHOST changed roster before rejecting malformed /T operation token $name"
    }
    if ($tokenExpected.ContainsKey($name) -and [BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run "$name.DOP"))) -ne [BitConverter]::ToString($tokenExpected[$name])) {
      throw "CCHOST changed malformed /T operation token $name"
    }
  }
}
foreach ($name in @('TA1','TA2','TA3','TA4','TA5')) {
  if ((Get-Content (Join-Path $run "$name.STA") -Raw).Trim() -ne 'BAD' -or
      [BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run "$name.GPR"))) -ne [BitConverter]::ToString($roster)) {
    throw "CCHOST accepted malformed /D /T arguments $name"
  }
}
if ((Get-Content (Join-Path $run 'TAH.STA') -Raw).Trim() -ne 'BAD') {
  throw 'CCHOST accepted a /T tail on a /H request'
}
if ((Get-Content (Join-Path $run 'TMU.STA') -Raw).Trim() -ne 'OK' -or
    [IO.File]::ReadAllBytes((Join-Path $run 'TMU.GPR'))[424] -ne 17) {
  throw 'CCHOST token-validation mutation control did not bypass the malformed token'
}
$afterDokDamage = [IO.File]::ReadAllBytes((Join-Path $run 'DMD.GPR'))
foreach ($name in 'DMLEG', 'DHLEG') {
  if ((Get-Content (Join-Path $run "$name.LOG") -Raw) -notlike '*CCHOST: invalid host request*') {
    throw "CCHOST accepted a legacy compact mutation ($name)"
  }
}
if ([BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run 'DMLEG.GPR'))) -ne [BitConverter]::ToString($dokLegacyRoster)) {
  throw 'CCHOST changed a legacy compact roster while rejecting mutation'
}
foreach ($slot in 1, 2) {
  if ([BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run "DMLEG$slot.OUT"))) -ne
      [BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run "DMLEG$slot.PRE")))) {
    throw "CCHOST changed legacy source slot $slot while rejecting mutation"
  }
}
$afterDokDamageSource = [IO.File]::ReadAllBytes((Join-Path $run 'DMD.OUT'))
if ((Get-Content (Join-Path $run 'DMD.LOG') -Raw) -notlike '*CCHOST: effect damage applied*' -or
    [BitConverter]::ToUInt16($afterDokDamage, 16 + 1 + 216 + 6) -ne 17 -or
    [BitConverter]::ToUInt16($afterDokDamage, 16 + 1 + 216 + 26) -ne 93 -or
    $afterDokDamageSource[40] -ne 93 -or $afterDokDamageSource[214] -ne 17) {
  throw 'CCHOST /D did not update DoK current HP while preserving maximum HP'
}
foreach ($case in 'DMTR','DMTA','DMBD') {
  if ((Get-Content (Join-Path $run "$case.LOG") -Raw) -notlike '*CCHOST: invalid host request*') {
    throw "CCHOST accepted malformed direct-DAMAGE roster $case"
  }
  foreach ($suffix in '','1','2') {
    $before = [IO.File]::ReadAllBytes((Join-Path $run "$case$suffix.PRE"))
    $after = [IO.File]::ReadAllBytes((Join-Path $run "$case$suffix.OUT"))
    if ([BitConverter]::ToString($after) -ne [BitConverter]::ToString($before)) {
      throw "CCHOST changed $case$suffix before rejecting malformed direct-DAMAGE roster $case"
    }
  }
}
foreach ($case in 'DMP','DPS') {
  if ((Get-Content (Join-Path $run "$case.LOG") -Raw) -notlike '*CCHOST: invalid host request*') {
    throw "CCHOST accepted a multi-event DAMAGE stream after its later source disappeared ($case)"
  }
  foreach ($suffix in '','1') {
    $before = [IO.File]::ReadAllBytes((Join-Path $run "$case$suffix.PRE"))
    $after = [IO.File]::ReadAllBytes((Join-Path $run "$case$suffix.OUT"))
    if ([BitConverter]::ToString($after) -ne [BitConverter]::ToString($before)) {
      throw "CCHOST changed $case$suffix before rejecting a later multi-event DAMAGE source ($case)"
    }
  }
}
foreach ($case in 'DMWP','DMWS') {
  if ((Get-Content (Join-Path $run "$case.LOG") -Raw) -notlike '*CCHOST: invalid host request*') {
    throw "CCHOST did not fail its write-access source preflight before DAMAGE ($case)"
  }
  foreach ($suffix in '','1','2') {
    $before = [IO.File]::ReadAllBytes((Join-Path $run "$case$suffix.PRE"))
    $after = [IO.File]::ReadAllBytes((Join-Path $run "$case$suffix.OUT"))
    if ([BitConverter]::ToString($after) -ne [BitConverter]::ToString($before)) {
      throw "CCHOST changed $case$suffix before rejecting a write-access source preflight fault ($case)"
    }
  }
}
if ((Get-Content (Join-Path $run 'DMWR.LOG') -Raw) -notlike '*CCHOST: invalid host request*') {
  throw 'CCHOST accepted an injected late DoK source write-open failure'
}
if ((Get-Content (Join-Path $run 'DMM.LOG') -Raw) -notlike '*CCHOST: invalid host request*') {
  throw 'CCHOST accepted a low-slot DoK DAMAGE without every authoritative retail source'
}
if ([BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run 'DMM.OUT'))) -ne
    [BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run 'DMM.PRE'))) -or
    [BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run 'DMM1.OUT'))) -ne
    [BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run 'DMM1.PRE')))) {
  throw 'CCHOST mutated DoK GBPR or an earlier retail source before rejecting a missing low slot'
}
if ((Get-Content (Join-Path $run 'DMS.LOG') -Raw) -notlike '*CCHOST: effect damage applied*' -or
    [BitConverter]::ToUInt16([IO.File]::ReadAllBytes((Join-Path $run 'DMS.OUT')), 16 + 1 + 216 + 6) -ne 17) {
  throw 'CCHOST rejected a high-bit native DoK source slot without a retail source'
}
foreach ($case in 'DMGM','DMGT','DMGX','DMGV','DMGL','DMGY','DMGO','DM2B','DM2T') {
  if ((Get-Content (Join-Path $run "$case.LOG") -Raw) -notlike '*CCHOST: invalid host request*') {
    throw "CCHOST accepted malformed $case GBSL sidecar"
  }
  if ([BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run "$case.GPR"))) -ne [BitConverter]::ToString($roster)) {
    throw "CCHOST mutated $case roster before rejecting its GBSL sidecar"
  }
}
if ((Get-Content (Join-Path $run 'VALID.LOG') -Raw) -notlike '*CCHOST: combat result applied*') {
  throw 'CCHOST rejected valid GBHR v1 request'
}
foreach ($case in 'TRUNC','TRAIL','PAD') {
  $log = Get-Content (Join-Path $run "$case.LOG") -Raw
  if ($log -notlike '*CCHOST: invalid host request*') { throw "CCHOST invalid $case request lacked rejection diagnostic" }
}
$rngFailLog = Get-Content (Join-Path $run 'RNGFAIL.LOG') -Raw
if ($rngFailLog -notlike '*CCHOST: invalid host request*') {
  throw 'CCHOST missing continuation sink lacked rejection diagnostic'
}
if ([BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run 'RNGFAIL.GPR'))) -ne [BitConverter]::ToString($rngFailRoster)) {
  throw 'CCHOST mutated a roster before the continuation RNG publication succeeded'
}
if ((Get-Content (Join-Path $run 'SHORTCOK.LOG') -Raw) -notlike '*CCHOST: invalid host request*') {
  throw 'CCHOST accepted a CoK GBCR with a valid header but truncated result body'
}
if ([BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run 'SHORTCOK.GPR'))) -ne [BitConverter]::ToString($shortCokRoster)) {
  throw 'CCHOST mutated a CoK roster after rejecting a truncated result body'
}
if ([BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run 'SHORTCOK.GEF'))) -ne [BitConverter]::ToString($shortCokEffect)) {
  throw 'CCHOST published CoK combat RNG before validating the complete result body'
}
foreach ($case in @(
  @{ Name = 'SHORTROSTER'; Log = 'SROSTER.LOG' },
  @{ Name = 'PARTIAL'; Log = 'PROSTER.LOG' },
  @{ Name = 'TRAILROSTER'; Log = 'TROSTER.LOG' }
)) {
  $log = Get-Content (Join-Path $run $case.Log) -Raw
  if ($log -notlike '*CCHOST: invalid host request*') { throw "CCHOST accepted invalid $($case.Name) body" }
}
if ([BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run 'SHORTROSTER.GPR'))) -ne [BitConverter]::ToString($shortRoster)) {
  throw 'CCHOST extended a header-only GBPR roster'
}
if ([BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run 'SHORTROSTER.GEF'))) -ne [BitConverter]::ToString($shortRosterEffect)) {
  throw 'CCHOST published CoK RNG before rejecting a header-only GBPR roster'
}
if ([BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run 'PARTIAL.GPR'))) -ne [BitConverter]::ToString($partialRoster)) {
  throw 'CCHOST extended a partially truncated GBPR roster'
}
if ([BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run 'PARTIAL.GEF'))) -ne [BitConverter]::ToString($partialRosterEffect)) {
  throw 'CCHOST published CoK RNG before rejecting a partially truncated GBPR roster'
}
if ([BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run 'TRAILROSTER.GPR'))) -ne [BitConverter]::ToString($trailingRoster)) {
  throw 'CCHOST changed a GBPR roster with trailing bytes'
}
if ([BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run 'TRAILROSTER.GEF'))) -ne [BitConverter]::ToString($trailingRosterEffect)) {
  throw 'CCHOST published CoK RNG before rejecting a trailing GBPR roster'
}
$afterRoster = [IO.File]::ReadAllBytes((Join-Path $run 'GOOD.GPR'))
if ($afterRoster[16 + 1 + 392] -ne 4 -or $afterRoster[16 + 1 + 407] -ne 7) {
  throw 'CCHOST valid request did not apply COK condition/current-HP result'
}
$afterEffect = [IO.File]::ReadAllBytes((Join-Path $run 'GOOD.GEF'))
if (([BitConverter]::ToUInt32($afterEffect, 126)) -ne $rng) {
  throw 'CCHOST valid request did not synchronize COK combat RNG'
}
if ((Get-Content (Join-Path $run 'VALID.LOG') -Raw) -notlike '*CCHOST: combat result applied*') {
  throw 'CCHOST valid request lacked success diagnostic'
}
$afterGenRoster = [IO.File]::ReadAllBytes((Join-Path $run 'GEN.GPR'))
if ($afterGenRoster[16 + 1 + 392] -ne 4 -or $afterGenRoster[16 + 1 + 407] -ne 7) {
  throw 'CCHOST did not apply a structurally valid Gen1 GBCR v1 result'
}
foreach ($case in 'GENBAD','GENMISS') {
  $log = Get-Content (Join-Path $run "$case.LOG") -Raw
  if ($log -notlike '*CCHOST: invalid host request*') {
    throw "CCHOST accepted $case non-CoK result before validation"
  }
}
if ([BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run 'BAD.GPR'))) -ne [BitConverter]::ToString($genRoster)) {
  throw 'CCHOST mutated a Gen1 roster after rejecting a truncated or missing result'
}
foreach ($case in 'GENSHORT','GENLONG') {
  if ((Get-Content (Join-Path $run "$case.LOG") -Raw) -notlike '*CCHOST: invalid host request*') {
    throw "CCHOST accepted a $case result with a mismatched populated party count"
  }
  if ([BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run "$case.GPR"))) -ne [BitConverter]::ToString($twoRoster)) {
    throw "CCHOST partially changed a roster after rejecting $case"
  }
  if ([BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run "$case.GEF"))) -ne [BitConverter]::ToString($effect)) {
    throw "CCHOST changed the continuation after rejecting $case"
  }
}
if ((Get-Content (Join-Path $run 'GENEQUAL.LOG') -Raw) -notlike '*CCHOST: combat result applied*') {
  throw 'CCHOST rejected an equal-count populated Gen1 handoff'
}
$afterEqualRoster = [IO.File]::ReadAllBytes((Join-Path $run 'GENEQUAL.GPR'))
if ($afterEqualRoster[16 + 1 + 392] -ne 4 -or
    $afterEqualRoster[16 + 410 + 1 + 392] -ne 4 -or
    $afterEqualRoster[16 + 1 + 407] -ne 7 -or
    $afterEqualRoster[16 + 410 + 1 + 407] -ne 7) {
  throw 'CCHOST equal-count Gen1 handoff did not update every roster member'
}
if ((Get-Content (Join-Path $run 'GENEMPTY.LOG') -Raw) -notlike '*CCHOST: combat result applied*') {
  throw 'CCHOST rejected a bridge-only fallback result with an empty Gen1 roster'
}
if ([BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run 'GENEMPTY.GPR'))) -ne [BitConverter]::ToString($emptyGenRoster) -or
    [BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run 'GENEMPTY.GEF'))) -ne [BitConverter]::ToString($emptyGenEffect)) {
  throw 'CCHOST changed an empty Gen1 fallback roster or continuation'
}
if ((Get-Content (Join-Path $run 'BCOMPACT.LOG') -Raw) -notlike '*CCHOST: invalid host request*') {
  throw 'CCHOST accepted a compact GBPR record without GBD1 metadata'
}
if ([BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run 'BADCOMPACT.GPR'))) -ne [BitConverter]::ToString($badCompactRoster)) {
  throw 'CCHOST changed a compact GBPR roster with malformed GBD1 metadata'
}
if ((Get-Content (Join-Path $run 'BCOMP2.LOG') -Raw) -notlike '*CCHOST: invalid host request*') {
  throw 'CCHOST accepted a later compact GBPR member without GBD1 metadata'
}
if ([BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run 'BADCOMP2.GPR'))) -ne [BitConverter]::ToString($badCompactSecond)) {
  throw 'CCHOST changed a compact GBPR roster after a later malformed GBD1 marker'
}
foreach ($case in 'DOKWIN','DOKLOSS','DOKFLEE') {
  if ((Get-Content (Join-Path $run "$case.LOG") -Raw) -notlike '*CCHOST: combat result applied*') {
    throw "CCHOST rejected valid compact DoK $case handoff"
  }
}
if ((Get-Content (Join-Path $run 'DOKNOC.LOG') -Raw) -notlike '*CCHOST: combat result applied*') {
  throw 'CCHOST rejected a DoK combat handoff without CCPARTY XP cache capability'
}

if ((Get-Content (Join-Path $run 'DOKCAST.LOG') -Raw) -notlike '*CCHOST: combat result applied*') {
  throw 'CCHOST rejected a DoK Cast receipt backed by a prepared Magic Missile'
}
$afterDokCast = [IO.File]::ReadAllBytes((Join-Path $run 'DOKCAST.GPR'))
if ([BitConverter]::ToString($afterDokCast) -eq [BitConverter]::ToString($dokCastRoster)) {
  throw 'CCHOST accepted a DoK Cast receipt without applying its combat handoff'
}
if ([BitConverter]::ToUInt16([IO.File]::ReadAllBytes((Join-Path $run 'DOKCAST.GCR')), 14) -ne 1) {
  throw 'CCHOST did not consume a successfully persisted DoK Cast receipt'
}
if (([IO.File]::ReadAllBytes((Join-Path $run 'DOKCAST.WIZ')) | Where-Object { $_ -eq 15 }).Count -ne 0) {
  throw 'CCHOST did not consume exactly the prepared DoK Magic Missile instance'
}
if (Test-Path (Join-Path $run 'SAVE\CHRDATA1.WIZ')) {
  throw 'CCHOST test did not remove the disposable DoK WIZ sidecar before the missing-source control'
}
if ((Get-Content (Join-Path $run 'DOKCASTB.LOG') -Raw) -notlike '*CCHOST: invalid host request*') {
  throw 'CCHOST accepted a DoK Cast receipt without its source WIZ record'
}
if ((Get-Content (Join-Path $run 'DOKTXF.LOG') -Raw) -notlike '*CCHOST: invalid host request*') {
  throw 'CCHOST final-receipt fault did not surface as a failed handoff'
}
if ((Get-Content (Join-Path $run 'DOKTXR.LOG') -Raw) -notlike '*CCHOST: combat result applied*') {
  throw 'CCHOST did not resume a finalizing v1 result after the injected receipt failure'
}
if ([BitConverter]::ToUInt16([IO.File]::ReadAllBytes((Join-Path $run 'DOKTX.GCR')), 14) -ne 1) {
  throw 'CCHOST retry did not consume the previously finalizing v1 result'
}
if (Test-Path (Join-Path $run 'DOKTX.GBT')) {
  throw 'CCHOST left a finalization record after completing its retry'
}
$afterDokTx = [IO.File]::ReadAllBytes((Join-Path $run 'DOKTX.GPR'))
if ([BitConverter]::ToUInt32($afterDokTx, 16 + 1 + 0x62) -ne 4 -or
    [BitConverter]::ToUInt32($afterDokTx, 16 + 410 + 1 + 0x62) -ne 105) {
  throw 'CCHOST replayed a finalizing v1 result and awarded its DoK XP twice'
}
if (([IO.File]::ReadAllBytes((Join-Path $run 'DOKTX.OUT')) | Where-Object { $_ -eq 15 }).Count -ne 0) {
  throw 'CCHOST replayed a finalizing v1 result and consumed another DoK spell'
}
if ((Get-Content (Join-Path $run 'DOKRBF.LOG') -Raw) -notlike '*CCHOST: invalid host request*') {
  throw 'CCHOST prepared-state fault did not surface as a failed handoff'
}
if ((Get-Content (Join-Path $run 'DOKRBS.LOG') -Raw) -notlike '*CCHOST: invalid host request*') {
  throw 'CCHOST recovery-stop fixture did not stop after restoring the prepared preimage'
}
if ([BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run 'DOKRB.PRE'))) -ne [BitConverter]::ToString($dokRoster)) {
  throw 'CCHOST prepared-state recovery did not restore the exact GBPR preimage'
}
if ([BitConverter]::ToUInt16([IO.File]::ReadAllBytes((Join-Path $run 'DOKRB.GC0')), 14) -ne 0) {
  throw 'CCHOST prepared-state recovery consumed a result before its normal retry'
}
if ([BitConverter]::ToUInt32([IO.File]::ReadAllBytes((Join-Path $run 'DOKRB1.OUT')), 0x62) -ne ([uint32]::MaxValue - 5) -or
    [BitConverter]::ToUInt32([IO.File]::ReadAllBytes((Join-Path $run 'DOKRB2.OUT')), 0x62) -ne 100) {
  throw 'CCHOST prepared-state recovery did not restore the raw DoK .GAM preimage'
}
if (([IO.File]::ReadAllBytes((Join-Path $run 'DOKRB.WIN')) | Where-Object { $_ -eq 15 }).Count -ne 1) {
  throw 'CCHOST prepared-state recovery did not restore the original DoK spell sidecar'
}
if ((Get-Content (Join-Path $run 'DOKRBR.LOG') -Raw) -notlike '*CCHOST: combat result applied*') {
  throw 'CCHOST did not recover a prepared v1 preimage before retrying it'
}
if (Test-Path (Join-Path $run 'DOKRB.GBT')) {
  throw 'CCHOST left a prepared recovery record after restoring and retrying it'
}
if ([BitConverter]::ToUInt16([IO.File]::ReadAllBytes((Join-Path $run 'DOKRB.GCR')), 14) -ne 1) {
  throw 'CCHOST prepared-state recovery did not consume its retried v1 result'
}
$afterDokRollback = [IO.File]::ReadAllBytes((Join-Path $run 'DOKRB.GPR'))
if ([BitConverter]::ToUInt32($afterDokRollback, 16 + 1 + 0x62) -ne 4 -or
    [BitConverter]::ToUInt32($afterDokRollback, 16 + 410 + 1 + 0x62) -ne 105) {
  throw 'CCHOST prepared-state recovery replayed DoK XP instead of restoring first'
}
if (([IO.File]::ReadAllBytes((Join-Path $run 'DOKRB.OUT')) | Where-Object { $_ -eq 15 }).Count -ne 0) {
  throw 'CCHOST prepared-state recovery did not restore and consume exactly one spell'
}
if ((Get-Content (Join-Path $run 'GENRBF.LOG') -Raw) -notlike '*CCHOST: invalid host request*' -or
    (Get-Content (Join-Path $run 'GENRBS.LOG') -Raw) -notlike '*CCHOST: invalid host request*') {
  throw 'CCHOST Gen1 prepared-source fixtures did not stop at the fault and recovery boundaries'
}
if ([BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run 'GENRB.OUT'))) -ne [BitConverter]::ToString($genRollbackSave)) {
  throw 'CCHOST prepared-state recovery rebuilt a divergent Gen1 source save from GBPR instead of restoring its exact preimage'
}
if ([BitConverter]::ToUInt16([IO.File]::ReadAllBytes((Join-Path $run 'GENRB.GCR')), 14) -ne 1 -or
    (Get-Content (Join-Path $run 'GENRBR.LOG') -Raw) -notlike '*CCHOST: combat result applied*') {
  throw 'CCHOST did not apply the restored Gen1 source handoff exactly once'
}
$afterGenRollback = [IO.File]::ReadAllBytes((Join-Path $run 'GENRB.FIN'))
if ($afterGenRollback[392] -ne 4 -or $afterGenRollback[407] -ne 7 -or
    [BitConverter]::ToUInt32($afterGenRollback, 278) -ne 10) {
  throw 'CCHOST did not apply the normal Gen1 source update after exact prepared-state recovery'
}
if ([BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $run 'DOKCASTBAD.GPR'))) -ne [BitConverter]::ToString($dokCastBadRoster)) {
  throw 'CCHOST changed a DoK roster before rejecting a Cast without source spell evidence'
}
$afterDokNoCache = [IO.File]::ReadAllBytes((Join-Path $run 'DOKNOC.GPR'))
if ([BitConverter]::ToUInt32($afterDokNoCache, 16 + 1 + 0x62) -ne ([uint32]::MaxValue - 5) -or
    $afterDokNoCache[16 + 1 + 0xc6] -ne 0) {
  throw 'CCHOST awarded DoK combat XP without CCPARTY cache capability'
}

if ((Get-Content (Join-Path $run 'DOKRP.LOG') -Raw) -notlike '*CCHOST: invalid host request*') {
  throw 'CCHOST accepted a consumed DoK combat result for replay'
}

$afterDokWin = [IO.File]::ReadAllBytes((Join-Path $run 'DOKWIN.GPR'))
if ([BitConverter]::ToUInt32($afterDokWin, 16 + 1 + 0x62) -ne 4 -or
    $afterDokWin[16 + 1 + 0xc6] -ne 1 -or
    [BitConverter]::ToUInt32($afterDokWin, 16 + 410 + 1 + 0x62) -ne 105 -or
    $afterDokWin[16 + 410 + 1 + 0xc6] -ne 0) {
  throw 'CCHOST DoK victory did not apply per-member XP split, u32 carry, and readiness'
}
$afterDokWinSource1 = [IO.File]::ReadAllBytes((Join-Path $run 'SAVE\CHRDATA1.GAM'))
$afterDokWinSource2 = [IO.File]::ReadAllBytes((Join-Path $run 'SAVE\CHRDATA2.GAM'))
if ([BitConverter]::ToUInt32($afterDokWinSource1, 0x62) -ne 4 -or
    $afterDokWinSource1[0xc6] -ne 1 -or
    [BitConverter]::ToUInt32($afterDokWinSource2, 0x62) -ne 105 -or
    $afterDokWinSource2[0xc6] -ne 0) {
  throw 'CCHOST DoK victory did not persist raw .GAM XP/readiness for cold reload'
}
foreach ($case in 'DOKLOSS','DOKFLEE') {
  $after = [IO.File]::ReadAllBytes((Join-Path $run "$case.GPR"))
  if ([BitConverter]::ToUInt32($after, 16 + 1 + 0x62) -ne ([uint32]::MaxValue - 5) -or
      [BitConverter]::ToUInt32($after, 16 + 410 + 1 + 0x62) -ne 100) {
    throw "CCHOST awarded DoK combat XP for a $case outcome"
  }
}

if ((Get-Content (Join-Path $run 'OTHER.LOG') -Raw) -notlike '*CCHOST: combat result applied*') {
  throw 'CCHOST rejected a valid generic result with no persistent roster'
}
if (Test-Path (Join-Path $run 'NONE.GPR')) {
  throw 'CCHOST created a persistent roster for a generic fallback-party result'
}
if ((Get-Content (Join-Path $run 'OTHERBAD.LOG') -Raw) -notlike '*CCHOST: invalid host request*') {
  throw 'CCHOST accepted a malformed generic result before checking its structure'
}
# A DQK-class host can have a normalized GBPR but no private SAVE directory.
# DOS error 3 (path not found) must be source-less just like a missing CHRDATA
# file, not a reason to reject the handoff before persisting its receipt.
$noSaveRun = Join-Path $build 'cchost-no-save-test'
if (Test-Path $noSaveRun) { Remove-Item -Recurse -Force $noSaveRun }
New-Item -ItemType Directory -Path $noSaveRun -Force | Out-Null
Copy-Item (Join-Path $build 'cchost.com') (Join-Path $noSaveRun 'CCHOST.COM') -Force
[IO.File]::WriteAllBytes((Join-Path $noSaveRun 'NOSAVE.GCR'), [byte[]]$genResult.Clone())
[IO.File]::WriteAllBytes((Join-Path $noSaveRun 'NOSAVE.GPR'), [byte[]]$genRoster.Clone())
[IO.File]::WriteAllBytes((Join-Path $noSaveRun 'NOSAVE.GEF'), [byte[]]$effect.Clone())
[IO.File]::WriteAllBytes((Join-Path $noSaveRun 'NOSAVE.GHR'), (New-Request 3 'C:\NOSAVE.GCR' 'C:\NOSAVE.GPR' 'C:\NOSAVE.GEF'))
$noSaveConf = Join-Path $noSaveRun '_cchost-no-save.conf'
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[autoexec]
mount C "$noSaveRun"
C:
CCHOST /H C:\NOSAVE.GHR > C:\NOSAVE.LOG
exit
"@ | Set-Content -Path $noSaveConf -Encoding ASCII
$noSaveProcess = Start-DosBoxSmoke -Dosbox $dosbox -Conf $noSaveConf -Headless:$Headless
if (-not $noSaveProcess.WaitForExit(30000)) {
  Stop-DosBoxSmoke -Process $noSaveProcess
  throw 'DOSBox did not exit while running CCHOST source-less SAVE-directory control'
}
if ((Get-Content (Join-Path $noSaveRun 'NOSAVE.LOG') -Raw) -notlike '*CCHOST: combat result applied*') {
  throw 'CCHOST rejected a populated v1 handoff merely because SAVE does not exist'
}
if (Test-Path (Join-Path $noSaveRun 'SAVE')) {
  throw 'CCHOST created a private SAVE directory for a source-less handoff'
}
if (Test-Path (Join-Path $noSaveRun 'NOSAVE.GBT')) {
  throw 'CCHOST left a finalization record for a source-less handoff'
}
$noSaveResult = [IO.File]::ReadAllBytes((Join-Path $noSaveRun 'NOSAVE.GCR'))
$noSaveRoster = [IO.File]::ReadAllBytes((Join-Path $noSaveRun 'NOSAVE.GPR'))
if ([BitConverter]::ToUInt16($noSaveResult, 14) -ne 1 -or
    $noSaveRoster[16 + 1 + 392] -ne 4 -or $noSaveRoster[16 + 1 + 407] -ne 7) {
  throw 'CCHOST source-less handoff did not commit its one-row Gen1 result exactly once'
}
# --- Direct-DAMAGE journal (GBDJ) reader fixtures ---------------------------
# D1 (parse_args .recovery stack imbalance) and D2 (damage_journal_validate_
# sources .absent skipping the presence byte) both live in the /R recovery
# path, which the tests above never exercise. This runs in its own DOSBox
# session with its own conf and an explicit timeout, separate from every
# session above: a D1 regression hangs DOSBox, and that must not take the
# GBHR/DAMAGE contract cases above down with it.
#
# recover_damage_journal (native/src/cchost_damage_journal.inc) has exactly
# one genuine success path today: COMMITTED (state 1), which is a real,
# structurally-checked receipt (G1) and returns CF clear -- with the exact
# "already committed" message -- in every build, including unmodified
# production (see RJC/RJCM below). PREPARED (state 0) still always falls into
# .close_bad -- destination preflight/restore are plan steps 5-6 -- even
# after the full G5 cross-field and G6 current-file comparison now run, so a
# plain "/R was rejected" fixture still can't distinguish a real PREPARED
# reader fix from a no-op. CCHOST.GJA (built above with
# -D CCHOST_TEST_GBDJ_ACCEPT_MARK=1) prints a distinct marker at the point
# where every PREPARED check, including the G6 current-file stream compare,
# has passed, immediately before that same unconditional fall-through, so a
# PREPARED rejection fixture becomes a discriminating probe. CCHOST.RJP is an
# explicit unmodified production copy, used to prove the marker is test-only
# and production still fails closed on a well-formed PREPARED journal (RJVPRD)
# while still succeeding for real on a well-formed COMMITTED one (RJC).
$gbdjRun = Join-Path $build 'cchost-gbdj-test'
if (Test-Path $gbdjRun) { Remove-Item -Recurse -Force $gbdjRun }
New-Item -ItemType Directory -Force $gbdjRun | Out-Null
Copy-Item (Join-Path $build 'cchost.com') (Join-Path $gbdjRun 'CCHOST.COM') -Force
Copy-Item (Join-Path $build 'cchost.com') (Join-Path $gbdjRun 'CCHOST.RJP') -Force
Copy-Item $gbdjMarkerCom (Join-Path $gbdjRun 'CCHOST.GJA') -Force
Copy-Item $gbdjHold8Com (Join-Path $gbdjRun 'CCHOST.GH8') -Force
Copy-Item $gbdjHold9Com (Join-Path $gbdjRun 'CCHOST.GH9') -Force
New-Item -ItemType Directory -Force (Join-Path $gbdjRun 'GJSRC') | Out-Null
# Destination preflight (plan step 5) needs real target files under GJSRC:
# CHRDATA1..6.GAM, 216 bytes each, so the existing positive controls
# (RJV/RJV2/RJS1/RJSB) now open a real destination instead of never reaching
# one at all. Content is never inspected by preflight (only size and
# openability), so zero-filled is sufficient.
for ($i = 1; $i -le 6; $i++) {
  [IO.File]::WriteAllBytes((Join-Path $gbdjRun "GJSRC\CHRDATA$i.GAM"), (New-Object byte[] 216))
}

function Get-GbdjRosterCount([byte[]]$Gbpr) { return [BitConverter]::ToUInt16($Gbpr, 6) }
function Get-GbdjRosterSlot([byte[]]$Gbpr, [int]$Ordinal) { return $Gbpr[16 + ($Ordinal * 410)] }
function Get-GbdjRosterRaw([byte[]]$Gbpr, [int]$Ordinal) {
  $raw = New-Object byte[] 216
  [Array]::Copy($Gbpr, 16 + ($Ordinal * 410) + 1, $raw, 0, 216)
  return ,$raw
}
function New-GbdjSourceEntry([byte]$Present, [byte]$Slot, [byte[]]$Raw) {
  $entry = New-Object byte[] 218
  $entry[0] = $Present
  $entry[1] = $Slot
  if ($null -ne $Raw) { [Array]::Copy($Raw, 0, $entry, 2, [Math]::Min(216, $Raw.Length)) }
  return ,$entry
}
function New-GbdjDefaultSources([byte[]]$Gbpr, [UInt16]$Mask) {
  $count = Get-GbdjRosterCount $Gbpr
  $entries = @()
  for ($i = 0; $i -lt 6; $i++) {
    $targeted = ($Mask -band (1 -shl $i)) -ne 0
    if ($targeted -and $i -lt $count) {
      $entries += ,(New-GbdjSourceEntry 1 (Get-GbdjRosterSlot $Gbpr $i) (Get-GbdjRosterRaw $Gbpr $i))
    } else {
      $entries += ,(New-GbdjSourceEntry 0 0 $null)
    }
  }
  return ,$entries
}

# $dokRoster (defined above) is a fixed 2-member compact GBPR, slots 1 and 2.
# The preflight fixtures need rosters with slots it cannot express (PF02 needs
# all six slots 1..6; PF03 needs the non-contiguous, non-identity set
# {4, 2, 6}) -- this builds a compact GBPR for an arbitrary ordered slot list,
# same shape as $dokRoster's own construction (stride 410, real GBD1 markers),
# generalised to N members.
function New-GbdjRoster([byte[]]$Slots) {
  $count = $Slots.Length
  $roster = New-Object byte[] (16 + ($count * 410))
  [Text.Encoding]::ASCII.GetBytes('GBPR').CopyTo($roster, 0)
  Set-U16 $roster 4 2
  Set-U16 $roster 6 $count
  Set-U16 $roster 8 410
  Set-U16 $roster 10 1
  Set-U16 $roster 12 2
  Set-U16 $roster 14 1
  for ($i = 0; $i -lt $count; $i++) {
    $off = 16 + ($i * 410)
    $roster[$off] = $Slots[$i]
    [Text.Encoding]::ASCII.GetBytes('GBD1').CopyTo($roster, $off + 1 + 216)
    Set-U16 $roster ($off + 1 + 216 + 4) 5
    Set-U16 $roster ($off + 1 + 216 + 6) 20
    Set-U16 $roster ($off + 1 + 216 + 26) 20
    $roster[$off + 1 + 0x45] = 1
  }
  return ,$roster
}

# A retained "fixed effect" is a real GBEF envelope, not filler: step 4's G5
# reads its magic, version (9 for a 5750-byte v9 terminal, 14 for a 5920-byte
# v14 terminal) and flags word (FX_HAVE_SIDECAR, 0100h) directly out of the
# journal, and G6 then requires the *current* on-disk effect to match these
# bytes exactly. $Extent overrides the buffer length for a deliberately
# structural mismatch (e.g. a v9-shaped extent carrying a v14 version word).
function New-GbefBytes {
  param([UInt16]$Version = 9, [UInt16]$Flags = 0, $Extent = $null)
  $len = if ($null -ne $Extent) { [int]$Extent } elseif ($Version -eq 14) { 5920 } else { 5750 }
  $buf = New-Object byte[] $len
  [Text.Encoding]::ASCII.GetBytes('GBEF').CopyTo($buf, 0)
  Set-U16 $buf 4 $Version
  Set-U16 $buf 6 $Flags
  return ,$buf
}

# A GBSL v1 sidecar: "GBSL", u16 version=1, u16 record_count, then count fixed
# 54-byte {GBSX event[20], text[34]} records (native/src/ccflow.asm). Content
# past the 8-byte header is never inspected by G5/G6 beyond exact byte
# equality, so it is left zero-filled.
function New-GbslBytes {
  param([UInt16]$Count = 1, [UInt16]$VersionOverride = 1, $Extent = $null)
  $len = if ($null -ne $Extent) { [int]$Extent } else { 8 + 54 * $Count }
  $buf = New-Object byte[] $len
  [Text.Encoding]::ASCII.GetBytes('GBSL').CopyTo($buf, 0)
  Set-U16 $buf 4 $VersionOverride
  Set-U16 $buf 6 $Count
  return ,$buf
}

# One long PRINTCLEAR at the final row keeps the v2 trailer near the 16-bit
# sidecar boundary. The GBDJ embeds it after an 8 KiB prefix, so validation
# must seek with CX:DX instead of losing the carry from base + row offset.
function New-GbslV2BoundaryBytes {
  $count = 1212
  $codes = @(1) * 33 + @(0) # 33 decoded 'A' characters and a zero terminator
  $packed = [Collections.Generic.List[byte]]::new()
  $bits = 0
  $value = 0
  foreach ($code in $codes) {
    for ($shift = 5; $shift -ge 0; $shift--) {
      $value = (($value -shl 1) -bor (($code -shr $shift) -band 1)) -band 255
      $bits++
      if ($bits -eq 8) { $packed.Add([byte]$value); $bits = 0; $value = 0 }
    }
  }
  if ($bits -ne 0) { $packed.Add([byte](($value -shl (8 - $bits)) -band 255)) }
  if ($packed.Count -ne 26) { throw 'GBSL v2 boundary payload packing changed' }
  $recordsEnd = 8 + 54 * $count
  $tail = $recordsEnd + 12 + 8
  $buf = New-Object byte[] ($tail + $packed.Count)
  [Text.Encoding]::ASCII.GetBytes('GBSL').CopyTo($buf, 0)
  Set-U16 $buf 4 2
  Set-U16 $buf 6 $count
  $row = 8 + 54 * ($count - 1)
  Set-U16 $buf $row 0x12
  Set-U16 $buf ($row + 20) 0xffff
  [Text.Encoding]::ASCII.GetBytes('GBPX').CopyTo($buf, $row + 22)
  [Text.Encoding]::ASCII.GetBytes('GBPX').CopyTo($buf, $recordsEnd)
  Set-U16 $buf ($recordsEnd + 4) 1
  Set-U16 $buf ($recordsEnd + 6) 1
  Set-U32 $buf ($recordsEnd + 8) $packed.Count
  Set-U16 $buf ($recordsEnd + 12) ($count - 1)
  Set-U16 $buf ($recordsEnd + 16) $packed.Count
  Set-U16 $buf ($recordsEnd + 18) 33
  $packed.ToArray().CopyTo($buf, $tail)
  if ($buf.Length -ne 65502) { throw 'GBSL v2 boundary extent changed' }
  return ,$buf
}

# Build a GBDJ v1 journal byte buffer per docs/engine/direct-damage-journal-v1.md:
# header(480), GBPR preimage, six 218-byte source entries, fixed effect, then
# optional GBSL. Every field defaults to a well-formed value so a caller only
# has to override the one field under test.
function New-DamageJournal {
  param(
    [Parameter(Mandatory)][string]$RosterPath,
    [Parameter(Mandatory)][string]$SourceDirPath,
    [Parameter(Mandatory)][string]$TokenPath,
    [string]$EffectPath = 'C:\GJDEF.EFX',
    [UInt64]$Generation = 1,
    [UInt16]$Version = 1,
    [UInt16]$State = 0,
    [UInt16]$Flags = 1,
    [UInt16]$Mask = 1,
    [UInt32]$EffectExtent = 5920,
    [UInt32]$GbslExtent = 0,
    [Parameter(Mandatory)][byte[]]$Gbpr,
    $GbprExtentOverride = $null,
    [UInt16]$Reserved30 = 0,
    $Sources = $null,
    [byte[]]$EffectBytes = $null,
    [byte[]]$GbslBytes = $null
  )
  $gbprLen = if ($null -ne $GbprExtentOverride) { [UInt16]$GbprExtentOverride } else { [UInt16]$Gbpr.Length }
  if ($null -eq $Sources) { $Sources = New-GbdjDefaultSources $Gbpr $Mask }
  if ($null -eq $EffectBytes) { $EffectBytes = New-Object byte[] $EffectExtent }
  if ($null -eq $GbslBytes) { $GbslBytes = New-Object byte[] $GbslExtent }
  $total = 480 + $Gbpr.Length + (218 * 6) + $EffectBytes.Length + $GbslBytes.Length
  $buf = New-Object byte[] $total
  [Text.Encoding]::ASCII.GetBytes('GBDJ').CopyTo($buf, 0)
  Set-U16 $buf 4 $Version
  Set-U16 $buf 6 $State
  [BitConverter]::GetBytes($Generation).CopyTo($buf, 8)
  Set-U16 $buf 16 $Flags
  Set-U16 $buf 18 $Mask
  Set-U32 $buf 20 $EffectExtent
  Set-U32 $buf 24 $GbslExtent
  Set-U16 $buf 28 $gbprLen
  Set-U16 $buf 30 $Reserved30
  New-CanonicalPath $buf 32 $EffectPath
  New-CanonicalPath $buf 144 $RosterPath
  New-CanonicalPath $buf 256 $TokenPath
  New-CanonicalPath $buf 368 $SourceDirPath
  [Array]::Copy($Gbpr, 0, $buf, 480, $Gbpr.Length)
  $off = 480 + $Gbpr.Length
  foreach ($entry in $Sources) {
    [Array]::Copy($entry, 0, $buf, $off, 218)
    $off += 218
  }
  [Array]::Copy($EffectBytes, 0, $buf, $off, $EffectBytes.Length)
  $off += $EffectBytes.Length
  [Array]::Copy($GbslBytes, 0, $buf, $off, $GbslBytes.Length)
  return ,$buf
}

# A journal's EffectPath (+32) is a DOS identity like any other, so its final
# extension names the sibling GBSL exactly per make_damage_side_name's own
# separator-aware rule (last '.' after the last '\' or ':'). Used to compute
# where the *current* on-disk effect/sidecar files belong for a given
# EffectPath argument, mirroring what the reader itself derives.
function Get-GbdjSidePath([string]$EffectArg) {
  $lastSep = [Math]::Max($EffectArg.LastIndexOf('\'), $EffectArg.LastIndexOf(':'))
  $lastDot = $EffectArg.LastIndexOf('.')
  if ($lastDot -le $lastSep) { return $null }
  return $EffectArg.Substring(0, $lastDot) + '.GBS'
}
function ConvertTo-GbdjLocalPath([string]$Arg) {
  # Every /R identity used by this fixture set is 'C:\...' and $gbdjRun is
  # mounted as C, so the on-disk sibling is just the tail past 'C:\'.
  return Join-Path $gbdjRun ($Arg.Substring(3))
}

# $dokRoster (defined above: a 2-member compact GBPR, slots 1 and 2, real GBD1
# markers) is reused as both the embedded GBPR preimage and the on-disk
# roster file at the /R roster path, per the plan's fixture table.
#
# Every case's retained effect (and GBSL, when its extent is nonzero) is a
# real, correctly-shaped GBEF/GBSL envelope by default, matching the journal's
# own EffectExtent/GbslExtent -- not filler -- because G5 (step 4) now reads
# those bytes directly out of the journal on every case, reject or accept.
# By default the *current* on-disk files at EffectPath (and its GBS sibling)
# are written to match those same retained bytes exactly, so G6's PREPARED
# stream comparison also passes by default; a case that wants to exercise a
# current-file mismatch overrides -CurrentEffectBytes/-CurrentGbslBytes or
# uses -SkipCurrentEffect/-SkipCurrentGbsl to omit the file entirely.
function Resolve-GbdjJournalParams([string]$Name, [hashtable]$JournalParams) {
  $effectArg = if ($JournalParams.ContainsKey('EffectPath')) { $JournalParams['EffectPath'] } else { "C:\$Name.EFX" }
  $effectExtent = if ($JournalParams.ContainsKey('EffectExtent')) { [UInt32]$JournalParams['EffectExtent'] } else { 5920 }
  $gbslExtent = if ($JournalParams.ContainsKey('GbslExtent')) { [UInt32]$JournalParams['GbslExtent'] } else { 0 }
  if (-not $JournalParams.ContainsKey('EffectBytes')) {
    $gbefVersion = if ($effectExtent -eq 5750) { 9 } else { 14 }
    $sideFlag = if ($gbslExtent -gt 0) { 0x0100 } else { 0 }
    $JournalParams['EffectBytes'] = New-GbefBytes -Version $gbefVersion -Flags $sideFlag -Extent $effectExtent
  }
  if ($gbslExtent -gt 0 -and -not $JournalParams.ContainsKey('GbslBytes')) {
    $count = [Math]::Floor(($gbslExtent - 8) / 54)
    $JournalParams['GbslBytes'] = New-GbslBytes -Count $count -Extent $gbslExtent
  }
  if (-not $JournalParams.ContainsKey('EffectPath')) { $JournalParams['EffectPath'] = $effectArg }
  return @{ EffectArg = $effectArg; EffectExtent = $effectExtent; GbslExtent = $gbslExtent }
}
function Write-GbdjCurrentFiles {
  param([hashtable]$Resolved, [hashtable]$JournalParams, [byte[]]$CurrentEffectBytes, [byte[]]$CurrentGbslBytes, [switch]$SkipCurrentEffect, [switch]$SkipCurrentGbsl)
  if (-not $SkipCurrentEffect) {
    $bytes = if ($null -ne $CurrentEffectBytes) { $CurrentEffectBytes } else { $JournalParams['EffectBytes'] }
    [IO.File]::WriteAllBytes((ConvertTo-GbdjLocalPath $Resolved.EffectArg), $bytes)
  }
  if ($Resolved.GbslExtent -gt 0 -and -not $SkipCurrentGbsl) {
    $side = Get-GbdjSidePath $Resolved.EffectArg
    if ($null -ne $side) {
      $bytes = if ($null -ne $CurrentGbslBytes) { $CurrentGbslBytes } else { $JournalParams['GbslBytes'] }
      [IO.File]::WriteAllBytes((ConvertTo-GbdjLocalPath $side), $bytes)
    }
  }
}
function Write-GbdjCase {
  param(
    [Parameter(Mandatory)][string]$Name,
    [switch]$SkipJournal,
    [switch]$SkipToken,
    $TokenGeneration = $null,
    [hashtable]$JournalParams = @{},
    [byte[]]$CurrentEffectBytes = $null,
    [byte[]]$CurrentGbslBytes = $null,
    [switch]$SkipCurrentEffect,
    [switch]$SkipCurrentGbsl,
    # Destination preflight (step 5) fixtures need their own save directory
    # (never the shared GJSRC every reader-only fixture above uses) so a
    # targeted file's presence, size, or read-only attribute can be controlled
    # per case. Existing callers never pass this, so they keep using GJSRC.
    [string]$SourceDirPath = 'C:\GJSRC',
    # PFR1/PFR2/PFR3 need the on-disk roster FILE to disagree with the
    # embedded GBPR preimage (missing, or one byte over/under its extent)
    # without disturbing the journal's own G2/G3/preflight-size expectation.
    [switch]$SkipRosterFile,
    [byte[]]$RosterFileBytes = $null
  )
  $rosterArg = "C:\$Name.GPR"
  $sourceDirArg = $SourceDirPath
  $tokenArg = "C:\$Name.DOP"
  $gbpr = if ($JournalParams.ContainsKey('Gbpr')) { $JournalParams['Gbpr'] } else { $dokRoster }
  if (-not $SkipRosterFile) {
    $rosterBytes = if ($null -ne $RosterFileBytes) { $RosterFileBytes } else { $gbpr }
    [IO.File]::WriteAllBytes((Join-Path $gbdjRun "$Name.GPR"), $rosterBytes)
  }
  if (-not $SkipToken) {
    $gen = if ($null -ne $TokenGeneration) { [UInt64]$TokenGeneration }
           elseif ($JournalParams.ContainsKey('Generation')) { [UInt64]$JournalParams['Generation'] }
           else { [UInt64]1 }
    [IO.File]::WriteAllBytes((Join-Path $gbdjRun "$Name.DOP"), (New-OperationToken $gen))
  }
  if (-not $SkipJournal) {
    $resolved = Resolve-GbdjJournalParams $Name $JournalParams
    $params = @{ RosterPath = $rosterArg; SourceDirPath = $sourceDirArg; TokenPath = $tokenArg; Gbpr = $gbpr }
    foreach ($k in $JournalParams.Keys) { $params[$k] = $JournalParams[$k] }
    $journal = New-DamageJournal @params
    [IO.File]::WriteAllBytes((Join-Path $gbdjRun "$Name.GDJ"), $journal)
    Write-GbdjCurrentFiles -Resolved $resolved -JournalParams $JournalParams -CurrentEffectBytes $CurrentEffectBytes -CurrentGbslBytes $CurrentGbslBytes -SkipCurrentEffect:$SkipCurrentEffect -SkipCurrentGbsl:$SkipCurrentGbsl
  }
  return @{ Name = $Name; RosterArg = $rosterArg; SourceDirArg = $sourceDirArg }
}

# A handful of structural-rejection fixtures need to mutate the raw encoded
# bytes (truncate, extend, corrupt the magic) after normal construction.
function New-GbdjRawCase {
  param([Parameter(Mandatory)][string]$Name, [Parameter(Mandatory)][scriptblock]$Mutate, [hashtable]$JournalParams = @{})
  $rosterArg = "C:\$Name.GPR"
  $sourceDirArg = 'C:\GJSRC'
  $tokenArg = "C:\$Name.DOP"
  [IO.File]::WriteAllBytes((Join-Path $gbdjRun "$Name.GPR"), $dokRoster)
  [IO.File]::WriteAllBytes((Join-Path $gbdjRun "$Name.DOP"), (New-OperationToken 1))
  $resolved = Resolve-GbdjJournalParams $Name $JournalParams
  $params = @{ RosterPath = $rosterArg; SourceDirPath = $sourceDirArg; TokenPath = $tokenArg; Gbpr = $dokRoster }
  foreach ($k in $JournalParams.Keys) { $params[$k] = $JournalParams[$k] }
  $journal = New-DamageJournal @params
  $journal = & $Mutate $journal
  [IO.File]::WriteAllBytes((Join-Path $gbdjRun "$Name.GDJ"), $journal)
  Write-GbdjCurrentFiles -Resolved $resolved -JournalParams $JournalParams
  return @{ Name = $Name; RosterArg = $rosterArg; SourceDirArg = $sourceDirArg }
}

# Positive controls.
$gbdjRjv = Write-GbdjCase -Name 'RJV'
$gbdjRjv2 = Write-GbdjCase -Name 'RJV2' -JournalParams @{ Mask = 3 }

# D2 regression cases: a targeted-and-absent entry (mask=1 targets ordinal 0
# only) must reject when its own presence byte is nonzero, even though the
# remaining 216 body bytes and the unused slot byte are all zero.
$rd1Sources = New-GbdjDefaultSources $dokRoster 1
$rd1Sources[1] = New-GbdjSourceEntry 1 0 $null
$gbdjRd1 = Write-GbdjCase -Name 'RD1' -JournalParams @{ Sources = $rd1Sources }
$rd2Sources = New-GbdjDefaultSources $dokRoster 1
$rd2Sources[5] = New-GbdjSourceEntry 1 0 $null
$gbdjRd2 = Write-GbdjCase -Name 'RD2' -JournalParams @{ Sources = $rd2Sources }
$rd3Sources = New-GbdjDefaultSources $dokRoster 1
$rd3Sources[1] = New-GbdjSourceEntry 2 0 $null
$gbdjRd3 = Write-GbdjCase -Name 'RD3' -JournalParams @{ Sources = $rd3Sources }

# Structural rejection cases GJ01..GJ16, one deliberate defect each, otherwise
# a well-formed journal. All run against CCHOST.GJA; the marker must be
# absent in every one.
$gbdjGj01 = Write-GbdjCase -Name 'GJ01' -SkipJournal                                   # journal file missing
$gbdjGj02 = New-GbdjRawCase -Name 'GJ02' -Mutate { param($j) ,$j[0..($j.Length - 2)] }  # truncated by 1 byte
$gbdjGj03 = New-GbdjRawCase -Name 'GJ03' -Mutate { param($j) ,([byte[]]($j + 0x5a)) }   # 1 extra trailing byte
$gbdjGj04 = New-GbdjRawCase -Name 'GJ04' -Mutate { param($j) $j[0] = 0x58; ,$j }        # bad magic
$gbdjGj05 = Write-GbdjCase -Name 'GJ05' -JournalParams @{ Version = 2 }                 # version = 2
# State 1 is now COMMITTED (a real, structurally-checked success -- see RJC/
# RJCM below), so the "any other state" reject fixture moves to state 2.
$gbdjGj06 = Write-GbdjCase -Name 'GJ06' -JournalParams @{ State = 2 }                   # state = 2 (invalid)
$gbdjGj07 = Write-GbdjCase -Name 'GJ07' -JournalParams @{ Generation = 0 }              # generation = 0
$gbdjGj08 = Write-GbdjCase -Name 'GJ08' -TokenGeneration 2                              # generation mismatch vs token
$gbdjGj09 = Write-GbdjCase -Name 'GJ09' -SkipToken                                      # token file missing
$gbdjGj10 = Write-GbdjCase -Name 'GJ10' -JournalParams @{ Flags = 0 }                   # flags = 0
$gbdjGj11 = Write-GbdjCase -Name 'GJ11' -JournalParams @{ Reserved30 = 1 }              # reserved u16 @30 nonzero
$gbdjGj12 = Write-GbdjCase -Name 'GJ12' -JournalParams @{ Mask = 4 }                    # mask bit beyond roster count (2)
$gbdjGj13 = Write-GbdjCase -Name 'GJ13' -JournalParams @{ RosterPath = 'C:\WRONGRP.GPR' }    # roster path mismatch
$gbdjGj14 = Write-GbdjCase -Name 'GJ14' -JournalParams @{ SourceDirPath = 'C:\WRONGSD' }     # source-dir path mismatch
$gj15Sources = New-GbdjDefaultSources $dokRoster 1
$gj15Sources[0][1] = 9
$gbdjGj15 = Write-GbdjCase -Name 'GJ15' -JournalParams @{ Sources = $gj15Sources }      # present entry slot != roster slot
$gj16Roster = [byte[]]$dokRoster.Clone()
$gj16Roster[16 + 1 + 216] = 0x58
$gbdjGj16 = Write-GbdjCase -Name 'GJ16' -JournalParams @{ Gbpr = $gj16Roster }          # corrupted GBD1 marker

# GJ17..GJ28: step 4's new "all states" checks -- G5's mask==0 rule, D3's
# canonical-path enforcement on the two fields recover_damage_journal itself
# checks (+32 effect, +256 token), and the retained GBEF/GBSL cross-field
# checks. Each is built so only its one named defect stops it from reaching
# the marker; every other field is otherwise well-formed.
$gbdjGj17 = Write-GbdjCase -Name 'GJ17' -JournalParams @{ Mask = 0 }                                   # G5: mask = 0
$gbdjGj18 = Write-GbdjCase -Name 'GJ18' -JournalParams @{ EffectPath = 'C:\gj18.efx' }                 # D3: lowercase effect path
$gbdjGj19 = Write-GbdjCase -Name 'GJ19' -JournalParams @{ TokenPath = 'C:\gj19.dop' }                  # D3: lowercase token path
$gbdjGj20 = Write-GbdjCase -Name 'GJ20' -JournalParams @{ EffectPath = 'C:\X\..\GJ20.EFX' } -SkipCurrentEffect  # D3: '..' component
# GJ21: GBEF magic corrupted (still 5920 bytes, still version/flags-consistent
# otherwise) -- isolates the magic check from the version/flag checks below.
$gj21Effect = New-GbefBytes -Version 14 -Flags 0
$gj21Effect[0] = 0x58
$gbdjGj21 = Write-GbdjCase -Name 'GJ21' -JournalParams @{ EffectBytes = $gj21Effect }                  # G5: GBEF bad magic
# GJ22: extent says v9 (5750) but the retained envelope's own version word is
# 14 -- the extent/version cross-check, not the magic or flag checks.
$gj22Effect = New-GbefBytes -Version 14 -Flags 0 -Extent 5750
$gbdjGj22 = Write-GbdjCase -Name 'GJ22' -JournalParams @{ EffectExtent = 5750; EffectBytes = $gj22Effect }  # G5: version != extent
# GJ23: v14 (no sidecar declared) but the retained envelope's flags word still
# claims FX_HAVE_SIDECAR -- the flag/extent consistency check.
$gj23Effect = New-GbefBytes -Version 14 -Flags 0x0100
$gbdjGj23 = Write-GbdjCase -Name 'GJ23' -JournalParams @{ EffectBytes = $gj23Effect }                  # G5: sidecar flag set, extent 0
# GJ24..GJ28 all need a real v9+sidecar envelope (v14 can never carry a
# sidecar -- recover_damage_journal rejects that before G5 ever runs).
$gj24Gbsl = New-GbslBytes -Count 1
$gj24Gbsl[0] = 0x58
$gbdjGj24 = Write-GbdjCase -Name 'GJ24' -JournalParams @{ EffectExtent = 5750; GbslExtent = 62; GbslBytes = $gj24Gbsl }      # G5: GBSL bad magic
$gj25Gbsl = New-GbslBytes -Count 1 -VersionOverride 2
$gbdjGj25 = Write-GbdjCase -Name 'GJ25' -JournalParams @{ EffectExtent = 5750; GbslExtent = 62; GbslBytes = $gj25Gbsl }      # G5: GBSL version != 1
$gj26Gbsl = New-GbslBytes -Count 1
Set-U16 $gj26Gbsl 6 0
$gbdjGj26 = Write-GbdjCase -Name 'GJ26' -JournalParams @{ EffectExtent = 5750; GbslExtent = 62; GbslBytes = $gj26Gbsl }      # G5: GBSL count = 0
$gj27Gbsl = New-GbslBytes -Count 1
Set-U16 $gj27Gbsl 6 1214
$gbdjGj27 = Write-GbdjCase -Name 'GJ27' -JournalParams @{ EffectExtent = 5750; GbslExtent = 62; GbslBytes = $gj27Gbsl }      # G5: GBSL count > 1213
$gj28Gbsl = New-GbslBytes -Count 1
Set-U16 $gj28Gbsl 6 2
$gbdjGj28 = Write-GbdjCase -Name 'GJ28' -JournalParams @{ EffectExtent = 5750; GbslExtent = 62; GbslBytes = $gj28Gbsl }      # G5: 8+54*count != declared extent

# GJ29..GJ33: G6 (PREPARED only) -- the current on-disk effect/GBSL must exist
# with the exact retained size and equal the retained bytes exactly. Every one
# of these passes every structural and G5 check; only the current-file
# comparison can catch it, so it must be seen ONLY via the marker build (a
# production run can't distinguish this from any other PREPARED rejection).
$gj29Current = New-GbefBytes -Version 14 -Flags 0
$gj29Current[100] = $gj29Current[100] -bxor 0xFF
$gbdjGj29 = Write-GbdjCase -Name 'GJ29' -CurrentEffectBytes $gj29Current                               # G6: current effect content differs
$gbdjGj30 = Write-GbdjCase -Name 'GJ30' -SkipCurrentEffect                                             # G6: current effect missing
$gj31Current = New-GbefBytes -Version 14 -Flags 0 -Extent 5919
$gbdjGj31 = Write-GbdjCase -Name 'GJ31' -CurrentEffectBytes $gj31Current                                # G6: current effect size differs
$gj32Gbsl = New-GbslBytes -Count 1
$gj32GbslCurrent = [byte[]]$gj32Gbsl.Clone()
$gj32GbslCurrent[40] = $gj32GbslCurrent[40] -bxor 0xFF
$gbdjGj32 = Write-GbdjCase -Name 'GJ32' -JournalParams @{ EffectExtent = 5750; GbslExtent = 62; GbslBytes = $gj32Gbsl } -CurrentGbslBytes $gj32GbslCurrent   # G6: current GBSL content differs
$gbdjGj33 = Write-GbdjCase -Name 'GJ33' -JournalParams @{ EffectExtent = 5750; GbslExtent = 62 } -SkipCurrentGbsl      # G6: current GBSL missing

# Positive controls for the sidecar path: v9 + a small GBSL (RJS1), and v9 +
# the largest legal GBSL (RJSB, count=1213) whose journal alone crosses 64 KiB
# -- proving the GBSL's sequential (never u16-seek) read discipline holds past
# that boundary.
$gbdjRjs1 = Write-GbdjCase -Name 'RJS1' -JournalParams @{ EffectExtent = 5750; GbslExtent = 62 }
$gbdjRjsb = Write-GbdjCase -Name 'RJSB' -JournalParams @{ EffectExtent = 5750; GbslExtent = 65510 }
$rjsbBytes = [IO.File]::ReadAllBytes((Join-Path $gbdjRun 'RJSB.GDJ'))
if ($rjsbBytes.Length -ne 73884) { throw "RJSB journal expected to be exactly 73,884 bytes, got $($rjsbBytes.Length)" }
if ($rjsbBytes.Length -le 65536) { throw 'RJSB journal expected to exceed 64 KiB' }
$v2Boundary = New-GbslV2BoundaryBytes
$gbdjRjsv = Write-GbdjCase -Name 'RJSV' -JournalParams @{ EffectExtent = 5750; GbslExtent = $v2Boundary.Length; GbslBytes = $v2Boundary }
$v2Journal = [IO.File]::ReadAllBytes((Join-Path $gbdjRun 'RJSV.GDJ'))
if ($v2Journal.Length -le 65536) { throw 'RJSV v2 journal did not cross the 64 KiB seek boundary' }
$v2BadRow = [byte[]]$v2Boundary.Clone()
Set-U16 $v2BadRow (8 + 54 * 1212 + 12) 1210
$gbdjGjv1 = Write-GbdjCase -Name 'GJV1' -JournalParams @{ EffectExtent = 5750; GbslExtent = $v2BadRow.Length; GbslBytes = $v2BadRow }
$v2BadPadding = [byte[]]$v2Boundary.Clone()
$v2BadPadding[8 + 54 * 1211 + 28] = 1
$gbdjGjv2 = Write-GbdjCase -Name 'GJV2' -JournalParams @{ EffectExtent = 5750; GbslExtent = $v2BadPadding.Length; GbslBytes = $v2BadPadding }
$v2BadText = [byte[]]$v2Boundary.Clone()
$v2BadText[8 + 54 * 1212 + 20] = 0
$gbdjGjv3 = Write-GbdjCase -Name 'GJV3' -JournalParams @{ EffectExtent = 5750; GbslExtent = $v2BadText.Length; GbslBytes = $v2BadText }

# COMMITTED positives: RJC never consults the token or the current effect at
# all (both omitted here), and it is run against the *production* CCHOST
# build below (G1 says a completed /D is a genuine success in every build,
# not just the marker fixture). RJCM reissues the SAME /R C:\RJC.GPR command
# a second time under the marker build, against the identical unchanged
# RJC.GDJ on disk (build_damage_journal_path derives the journal name from
# the roster-path argument, so there is no separate RJCM journal file) --
# proving both that the committed short-circuit is independent of that
# instrumentation and that a repeat /R after a completed /D is idempotent.
$gbdjRjc = Write-GbdjCase -Name 'RJC' -JournalParams @{ State = 1 } -SkipToken -SkipCurrentEffect

# GJC1/GJC2: COMMITTED does not bypass the "all states" checks -- a bad
# roster-path binding or a mask of 0 must still be rejected even though the
# token/current-file checks that would normally examine PREPARED are skipped.
$gbdjGjc1 = Write-GbdjCase -Name 'GJC1' -JournalParams @{ State = 1; RosterPath = 'C:\WRONGRP.GPR' } -SkipToken -SkipCurrentEffect   # COMMITTED, roster mismatch
$gbdjGjc2 = Write-GbdjCase -Name 'GJC2' -JournalParams @{ State = 1; Mask = 0 } -SkipToken -SkipCurrentEffect                        # COMMITTED, mask = 0

# GJDOP (amendment B): the token path (+256) must equal the ".DOP" sibling of
# the effect path (+32). Write-GbdjCase always writes the on-disk token at
# "C:\<Name>.DOP" ("C:\GJDOP.DOP" here) regardless of any EffectPath override,
# so overriding EffectPath to "C:\GJDOPX.EFX" alone produces the deliberate
# mismatch: the embedded effect path's own ".DOP" sibling would be
# "C:\GJDOPX.DOP", not the "C:\GJDOP.DOP" actually stored at +256. No other
# field needs to disagree -- amendment B is checked independently of G1-G6.
$gbdjGjdop = Write-GbdjCase -Name 'GJDOP' -JournalParams @{ EffectPath = 'C:\GJDOPX.EFX' }

# --- Destination preflight (plan step 5) -------------------------------------
function New-GbdjPreflightDir {
  param([Parameter(Mandatory)][string]$LocalName, [int[]]$PresentSlots = @(), [hashtable]$SlotBytes = @{})
  $dir = Join-Path $gbdjRun $LocalName
  New-Item -ItemType Directory -Force $dir | Out-Null
  foreach ($slot in $PresentSlots) {
    $bytes = if ($SlotBytes.ContainsKey($slot)) { $SlotBytes[$slot] } else { New-Object byte[] 216 }
    [IO.File]::WriteAllBytes((Join-Path $dir "CHRDATA$slot.GAM"), $bytes)
  }
  return "C:\$LocalName"
}

# PF01: one target, its destination present.
$pf01Roster = New-GbdjRoster @(3)
$pf01Dir = New-GbdjPreflightDir -LocalName 'PF01' -PresentSlots @(3)
$gbdjPf01 = Write-GbdjCase -Name 'PF01' -SourceDirPath $pf01Dir -JournalParams @{ Gbpr = $pf01Roster; Mask = 1 }

# PF02: six-member roster, slots 1..6, mask 0x3F, all six destinations present.
$pf02Roster = New-GbdjRoster @(1, 2, 3, 4, 5, 6)
$pf02Dir = New-GbdjPreflightDir -LocalName 'PF02' -PresentSlots @(1, 2, 3, 4, 5, 6)
$gbdjPf02 = Write-GbdjCase -Name 'PF02' -SourceDirPath $pf02Dir -JournalParams @{ Gbpr = $pf02Roster; Mask = 0x3F }

# PF03: three-member roster with slots {4, 2, 6}; mask targets ordinal 0 only
# (slot 4), and the save dir contains ONLY CHRDATA4.GAM. Proves the
# destination is built from the entry's own slot byte, never the table
# ordinal (PM5), and that an absent entry is never opened at all (PM6):
# ordinals 1/2 (slots 2, 6) have no file in this directory whatsoever.
$pf03Roster = New-GbdjRoster @(4, 2, 6)
$pf03Dir = New-GbdjPreflightDir -LocalName 'PF03' -PresentSlots @(4)
$gbdjPf03 = Write-GbdjCase -Name 'PF03' -SourceDirPath $pf03Dir -JournalParams @{ Gbpr = $pf03Roster; Mask = 1 }

# PFR1: roster file missing.
$pfr1Roster = New-GbdjRoster @(3)
$pfr1Dir = New-GbdjPreflightDir -LocalName 'PFR1' -PresentSlots @(3)
$gbdjPfr1 = Write-GbdjCase -Name 'PFR1' -SourceDirPath $pfr1Dir -SkipRosterFile -JournalParams @{ Gbpr = $pfr1Roster; Mask = 1 }

# PFR2/PFR3: on-disk roster size one byte over/under the embedded GBPR extent.
$pfr23Roster = New-GbdjRoster @(3)
$pfr2Bytes = New-Object byte[] ($pfr23Roster.Length + 1)
[Array]::Copy($pfr23Roster, $pfr2Bytes, $pfr23Roster.Length)
$pfr3Bytes = New-Object byte[] ($pfr23Roster.Length - 1)
[Array]::Copy($pfr23Roster, $pfr3Bytes, $pfr3Bytes.Length)
$pfr2Dir = New-GbdjPreflightDir -LocalName 'PFR2' -PresentSlots @(3)
$gbdjPfr2 = Write-GbdjCase -Name 'PFR2' -SourceDirPath $pfr2Dir -RosterFileBytes $pfr2Bytes -JournalParams @{ Gbpr = $pfr23Roster; Mask = 1 }
$pfr3Dir = New-GbdjPreflightDir -LocalName 'PFR3' -PresentSlots @(3)
$gbdjPfr3 = Write-GbdjCase -Name 'PFR3' -SourceDirPath $pfr3Dir -RosterFileBytes $pfr3Bytes -JournalParams @{ Gbpr = $pfr23Roster; Mask = 1 }

# PFR4: targeted source missing.
$pfr4Dir = New-GbdjPreflightDir -LocalName 'PFR4' -PresentSlots @()
$gbdjPfr4 = Write-GbdjCase -Name 'PFR4' -SourceDirPath $pfr4Dir -JournalParams @{ Gbpr = (New-GbdjRoster @(3)); Mask = 1 }

# PFR5/PFR6: targeted source is 215 / 217 bytes.
$pfr5Dir = New-GbdjPreflightDir -LocalName 'PFR5' -PresentSlots @(3) -SlotBytes @{ 3 = (New-Object byte[] 215) }
$gbdjPfr5 = Write-GbdjCase -Name 'PFR5' -SourceDirPath $pfr5Dir -JournalParams @{ Gbpr = (New-GbdjRoster @(3)); Mask = 1 }
$pfr6Dir = New-GbdjPreflightDir -LocalName 'PFR6' -PresentSlots @(3) -SlotBytes @{ 3 = (New-Object byte[] 217) }
$gbdjPfr6 = Write-GbdjCase -Name 'PFR6' -SourceDirPath $pfr6Dir -JournalParams @{ Gbpr = (New-GbdjRoster @(3)); Mask = 1 }

# PFR7: targeted source is host read-only (attribute set below, AFTER the
# after-snapshot per the brief -- Remove-Item -Force would otherwise clear it
# on the next run's cleanup, but the current run's own snapshot must see it).
$pfr7Dir = New-GbdjPreflightDir -LocalName 'PFR7' -PresentSlots @(3)
$gbdjPfr7 = Write-GbdjCase -Name 'PFR7' -SourceDirPath $pfr7Dir -JournalParams @{ Gbpr = (New-GbdjRoster @(3)); Mask = 1 }
$pfr7File = Join-Path $gbdjRun 'PFR7\CHRDATA3.GAM'

# PFR8: roster is host read-only.
$pfr8Dir = New-GbdjPreflightDir -LocalName 'PFR8' -PresentSlots @(3)
$gbdjPfr8 = Write-GbdjCase -Name 'PFR8' -SourceDirPath $pfr8Dir -JournalParams @{ Gbpr = (New-GbdjRoster @(3)); Mask = 1 }
$pfr8File = Join-Path $gbdjRun 'PFR8.GPR'

# PFR9: six-target journal whose slot-6 source alone is host read-only --
# source entries are processed in table order, and this roster's ordinal 5 is
# slot 6, so this is failure after five successful opens.
$pfr9Roster = New-GbdjRoster @(1, 2, 3, 4, 5, 6)
$pfr9Dir = New-GbdjPreflightDir -LocalName 'PFR9' -PresentSlots @(1, 2, 3, 4, 5, 6)
$gbdjPfr9 = Write-GbdjCase -Name 'PFR9' -SourceDirPath $pfr9Dir -JournalParams @{ Gbpr = $pfr9Roster; Mask = 0x3F }
$pfr9File = Join-Path $gbdjRun 'PFR9\CHRDATA6.GAM'

$gbdjReadOnlyFiles = @($pfr7File, $pfr8File, $pfr9File)
foreach ($f in $gbdjReadOnlyFiles) { Set-ItemProperty -Path $f -Name IsReadOnly -Value $true }

$gbdjPreflightCases = @{
  PFR1 = $gbdjPfr1; PFR2 = $gbdjPfr2; PFR3 = $gbdjPfr3; PFR4 = $gbdjPfr4
  PFR5 = $gbdjPfr5; PFR6 = $gbdjPfr6; PFR7 = $gbdjPfr7; PFR8 = $gbdjPfr8; PFR9 = $gbdjPfr9
}
$gbdjPreflightRejectCases = @('PFR1', 'PFR2', 'PFR3', 'PFR4', 'PFR5', 'PFR6', 'PFR7', 'PFR8', 'PFR9')

# PFO1: ordering. The current effect differs from the retained copy by one
# byte (a G6/reader failure) AND a targeted destination is separately
# read-only (a preflight-failing condition). Check-order rule 3 (every reader
# check, including G6, completes before destination preflight opens anything)
# means this must print the READER diagnostic, never the preflight one.
$pfo1Roster = New-GbdjRoster @(3)
$pfo1Dir = New-GbdjPreflightDir -LocalName 'PFO1' -PresentSlots @(3)
$pfo1CurrentEffect = New-GbefBytes -Version 14 -Flags 0
$pfo1CurrentEffect[100] = $pfo1CurrentEffect[100] -bxor 0xFF
$gbdjPfo1 = Write-GbdjCase -Name 'PFO1' -SourceDirPath $pfo1Dir -JournalParams @{ Gbpr = $pfo1Roster; Mask = 1 } -CurrentEffectBytes $pfo1CurrentEffect
$pfo1File = Join-Path $gbdjRun 'PFO1\CHRDATA3.GAM'
Set-ItemProperty -Path $pfo1File -Name IsReadOnly -Value $true
$gbdjReadOnlyFiles += $pfo1File

# Handle-budget cases (H8/H9/H9F): 5 standard + K held + up to 7 retained
# (1 roster + up to 6 sources) <= 20, now that the journal is closed before
# preflight opens anything. H8/H9 reuse PF02's own six-target journal
# unmodified; H9F targets a five-member roster so K=9 has headroom again.
$gbdjH9fRoster = New-GbdjRoster @(1, 2, 3, 4, 5)
$h9fDir = New-GbdjPreflightDir -LocalName 'H9F' -PresentSlots @(1, 2, 3, 4, 5)
$gbdjH9f = Write-GbdjCase -Name 'H9F' -SourceDirPath $h9fDir -JournalParams @{ Gbpr = $gbdjH9fRoster; Mask = 0x1F }

$gbdjRejectNames = @('RD1', 'RD2', 'RD3') + (1..33 | ForEach-Object { 'GJ{0:D2}' -f $_ }) + @('GJV1', 'GJV2', 'GJV3', 'GJC1', 'GJC2', 'GJDOP', 'PFO1')

# D1 argument-shape cases: run against the production build (already the
# active CCHOST.COM). Each must print exactly the arguments diagnostic and
# exit nonzero; none may hang DOSBox or corrupt execution.
$dirLen98 = 'C:\' + ('A' * 95)
$dirLen99 = 'C:\' + ('A' * 96)
$dirLen200 = 'C:\' + ('A' * 197)
$d1Cases = @(
  @{ Name = 'D1A'; Args = 'SAVE\X.GBP C:\S' },
  @{ Name = 'D1B'; Args = 'E:/X.GBP C:\S' },
  @{ Name = 'D1C'; Args = 'E:X.GBP C:\S' },
  @{ Name = 'D1D'; Args = 'C:\X.GBP SAVE\S' },
  @{ Name = 'D1E'; Args = 'C:\X.GBP C:/S' },
  @{ Name = 'D1F'; Args = 'C:\X.GBP C:S' },
  @{ Name = 'D1G'; Args = 'C:\X.GBP C:\S EXTRA' },
  # D1H: plan §27.5 amendment K changed this row's outcome. A bare one-
  # argument "/R C:\X.GBP" no longer stops in parse_args -- it derives the
  # save directory and reaches the ordinary reader, which reports "journal
  # absent" (no C:\X.GDJ exists anywhere in this session). D1H is therefore
  # EXCLUDED from the generic "(arguments)" verification loop below and
  # given its own assertion, near D1P's, further down.
  @{ Name = 'D1H'; Args = 'C:\X.GBP' },
  # D1I..D1O: the 98-char source-directory bound (G2) and the D3 rewrite of
  # validate_absolute_path (trailing '\', '.' / '..' components, lowercase),
  # exercised on both /R argument positions.
  @{ Name = 'D1I'; Args = "C:\X.GPR $dirLen99" },              # dirlen: 99 chars, one over the 98 bound
  @{ Name = 'D1J'; Args = "C:\X.GPR $dirLen200" },             # dirlen: 200 chars, over copy_token's own cap too
  @{ Name = 'D1K'; Args = 'C:\X\ C:\S' },                      # roster: trailing '\' (empty component)
  @{ Name = 'D1L'; Args = 'C:\.\X.GPR C:\S' },                 # roster: '.' component
  @{ Name = 'D1M'; Args = 'C:\X\..\Y.GPR C:\S' },              # roster: '..' component
  @{ Name = 'D1N'; Args = 'C:\x.gpr C:\S' },                   # roster: lowercase
  @{ Name = 'D1O'; Args = "C:\X.GPR C:\S\" },                  # source dir: trailing '\' (empty component)
  # D1Q/D1R: plan §27.5 amendment K, sub-task 9a. Amendment K only changes
  # what happens when the second argument is ENTIRELY absent (NUL/CR right
  # after the roster). Neither of these rows is that case, so both must
  # still fail argument parsing exactly as before K existed.
  @{ Name = 'D1Q'; Args = '' },                                # no argument at all after "/R " (empty roster token)
  @{ Name = 'D1R'; Args = 'C:\X.GBP /J' }                      # a THIRD, non-savedir-shaped token after the roster
)

$gbdjBatch = [Text.StringBuilder]::new()
function Add-GbdjCommand([string]$Name, [string]$Command) {
  [void]$gbdjBatch.AppendLine("$Command > C:\$Name.LOG")
  [void]$gbdjBatch.AppendLine("if errorlevel 1 goto $Name`_bad")
  [void]$gbdjBatch.AppendLine("echo OK>C:\$Name.STA")
  [void]$gbdjBatch.AppendLine("goto $Name`_done")
  [void]$gbdjBatch.AppendLine(":$Name`_bad")
  [void]$gbdjBatch.AppendLine("echo BAD>C:\$Name.STA")
  [void]$gbdjBatch.AppendLine(":$Name`_done")
}
foreach ($case in $d1Cases) {
  Add-GbdjCommand $case.Name "CCHOST /R $($case.Args)"
}
# D1P: boundary control. A 98-char source directory is VALID (the argument
# parser accepts it), so this must clear parse_args entirely and fail only
# inside recover_damage_journal itself (no C:\D1P.GDJ exists) -- proving the
# 98-char bound is not off-by-one in the strict direction. This must print
# the DIFFERENT "(result)" diagnostic, never "(arguments)".
Add-GbdjCommand 'D1P' "CCHOST /R C:\D1P.GPR $dirLen98"
# RJC: COMMITTED is a genuine success in the unmodified production build (G1)
# -- run it here, still under production, alongside the explicit RJV
# fail-closed control below.
[void]$gbdjBatch.AppendLine('copy C:\CCHOST.RJP C:\CCHOST.COM > nul')
Add-GbdjCommand 'RJC' 'CCHOST /R C:\RJC.GPR C:\GJSRC'
# RJVPRD and PFPRD are GONE (plan step 6): production now RESTORES on a valid
# PREPARED journal instead of failing closed, so a fixed-diagnostic reject
# probe against a well-formed PREPARED journal would break by design, not by
# regression. Their role -- proving production does something real on a
# well-formed PREPARED journal -- moves to RS01-RS08/RH8 in the new
# cchost-gbdr-test session below. This session keeps proving production fails
# closed IDENTICALLY to the marker build on every reject fixture, via the
# production replay appended after the marker-build matrix.
# Switch to the acceptance-marker build for the rest of the reader matrix.
[void]$gbdjBatch.AppendLine('copy C:\CCHOST.GJA C:\CCHOST.COM > nul')
Add-GbdjCommand 'RJVMRK' 'CCHOST /R C:\RJV.GPR C:\GJSRC'
Add-GbdjCommand 'RJV2' 'CCHOST /R C:\RJV2.GPR C:\GJSRC'
Add-GbdjCommand 'RJS1' 'CCHOST /R C:\RJS1.GPR C:\GJSRC'
Add-GbdjCommand 'RJSB' 'CCHOST /R C:\RJSB.GPR C:\GJSRC'
Add-GbdjCommand 'RJSV' 'CCHOST /R C:\RJSV.GPR C:\GJSRC'
# RJCM: the SAME journal RJC already used (build_damage_journal_path derives
# the filename from the roster-path argument, so reissuing "C:\RJC.GPR" reuses
# RJC.GDJ byte-for-byte), now under the marker build -- committed must succeed
# here too, and must NOT print the marker (the committed return happens before
# the marker code is ever reached).
Add-GbdjCommand 'RJCM' 'CCHOST /R C:\RJC.GPR C:\GJSRC'
# PF01/PF02/PF03: preflight positive controls, still under the marker build.
Add-GbdjCommand 'PF01' "CCHOST /R $($gbdjPf01.RosterArg) $($gbdjPf01.SourceDirArg)"
Add-GbdjCommand 'PF02' "CCHOST /R $($gbdjPf02.RosterArg) $($gbdjPf02.SourceDirArg)"
Add-GbdjCommand 'PF03' "CCHOST /R $($gbdjPf03.RosterArg) $($gbdjPf03.SourceDirArg)"
foreach ($name in $gbdjPreflightRejectCases) {
  $c = $gbdjPreflightCases[$name]
  Add-GbdjCommand $name "CCHOST /R $($c.RosterArg) $($c.SourceDirArg)"
}
# PFO1 uses its own save directory (C:\PFO1), so it is excluded from the
# generic GJSRC-based reject loop below even though it is a member of
# $gbdjRejectNames for assertion purposes.
Add-GbdjCommand 'PFO1' "CCHOST /R $($gbdjPfo1.RosterArg) $($gbdjPfo1.SourceDirArg)"
foreach ($name in ($gbdjRejectNames | Where-Object { $_ -ne 'PFO1' })) {
  Add-GbdjCommand $name "CCHOST /R C:\$name.GPR C:\GJSRC"
}
# H8/H9: PF02's own six-target journal (unmodified) under K=8 vs K=9 held
# handles -- predicts the 5+K+7<=20 boundary lands between them.
[void]$gbdjBatch.AppendLine('copy C:\CCHOST.GH8 C:\CCHOST.COM > nul')
Add-GbdjCommand 'H8' "CCHOST /R $($gbdjPf02.RosterArg) $($gbdjPf02.SourceDirArg)"
[void]$gbdjBatch.AppendLine('copy C:\CCHOST.GH9 C:\CCHOST.COM > nul')
Add-GbdjCommand 'H9' "CCHOST /R $($gbdjPf02.RosterArg) $($gbdjPf02.SourceDirArg)"
# H9F: same K=9 build, but a five-target journal, so headroom returns.
Add-GbdjCommand 'H9F' "CCHOST /R $($gbdjH9f.RosterArg) $($gbdjH9f.SourceDirArg)"
[void]$gbdjBatch.AppendLine('copy C:\CCHOST.RJP C:\CCHOST.COM > nul')
# Production replay of every reject (replaces RJVPRD/PFPRD's narrower single-
# case checks): re-issue each rejection fixture's exact command under the
# unmodified production build, logging to <name>P.LOG/.STA. .close_bad and
# .preflight_failed are shared, build-independent code paths (see
# cchost_damage_journal.inc), so production must fail with the identical
# diagnostic and status the marker build produced for the same fixture, and
# -- since none of these reach a restore -- must write nothing.
foreach ($name in ($gbdjRejectNames | Where-Object { $_ -ne 'PFO1' })) {
  Add-GbdjCommand "${name}P" "CCHOST /R C:\$name.GPR C:\GJSRC"
}
Add-GbdjCommand 'PFO1P' "CCHOST /R $($gbdjPfo1.RosterArg) $($gbdjPfo1.SourceDirArg)"
foreach ($name in $gbdjPreflightRejectCases) {
  $c = $gbdjPreflightCases[$name]
  Add-GbdjCommand "${name}P" "CCHOST /R $($c.RosterArg) $($c.SourceDirArg)"
}
[IO.File]::WriteAllText((Join-Path $gbdjRun 'GBDJCHK.BAT'), $gbdjBatch.ToString(), [Text.Encoding]::ASCII)

$gbdjConf = Join-Path $gbdjRun '_cchost-gbdj.conf'
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[autoexec]
mount C "$gbdjRun"
C:
call C:\GBDJCHK.BAT
exit
"@ | Set-Content -Path $gbdjConf -Encoding ASCII

# Standing invariant for every /R case above (positive and negative alike):
# every roster, source, token and journal file under the run directory must
# be byte-, size-, and mtime-identical before and after the whole session, and
# no new file may appear. This was TRIVIALLY TRUE through step 4 -- recover_
# damage_journal only ever opened the .GDJ and .DOP files, both read-only
# (INT 21h/3D00h), and never opened a roster or source file at all. Step 5's
# destination preflight is the first code to open a roster or source file for
# real (3D02h, read/write, so a genuinely writable handle), so this is now a
# live assertion, not a restated triviality: preflight only opens, seeks
# (4202h/4200h) and closes (3Eh) every destination -- it never issues an INT
# 21h/40h write -- so content and LastWriteTimeUtc must still be unchanged
# even though a real handle touched every one of these files this run.
# CCHOST.* build artifacts, *.LOG and *.STA are excluded since the batch above
# deliberately rewrites CCHOST.COM and every case writes its own log/status.
# stdout.txt and stderr.txt are DOSBox's own SDL console-capture files
# (already documented elsewhere in this repo as the retail-DOSBox-binary
# create/rewrite signature, unrelated to any file CCHOST touches) and are
# excluded for the same reason.
function Get-GbdjSnapshot([string]$Dir) {
  $files = Get-ChildItem -Path $Dir -Recurse -File | Where-Object {
    $_.Extension -notin @('.LOG', '.STA') -and $_.Name -notlike 'CCHOST.*' -and
    $_.Name -notin @('stdout.txt', 'stderr.txt')
  }
  $fileSnap = foreach ($f in $files) {
    [PSCustomObject]@{
      Path             = $f.FullName.Substring($Dir.Length)
      Size             = $f.Length
      LastWriteTimeUtc = $f.LastWriteTimeUtc.Ticks
      Hash             = (Get-FileHash -Path $f.FullName -Algorithm SHA256).Hash
    }
  }
  $dirSnap = foreach ($d in (Get-ChildItem -Path $Dir -Recurse -Directory)) {
    [PSCustomObject]@{ Path = $d.FullName.Substring($Dir.Length); LastWriteTimeUtc = $d.LastWriteTimeUtc.Ticks }
  }
  return @{ Files = @($fileSnap | Sort-Object Path); Dirs = @($dirSnap | Sort-Object Path) }
}

$gbdjBefore = Get-GbdjSnapshot $gbdjRun
$gbdjProcess = Start-DosBoxSmoke -Dosbox $dosbox -Conf $gbdjConf -Headless:$Headless
if (-not $gbdjProcess.WaitForExit(120000)) {
  Stop-DosBoxSmoke -Process $gbdjProcess
  throw 'DOSBox did not exit while running the CCHOST GBDJ reader / D1 argument-shape matrix'
}
$gbdjAfter = Get-GbdjSnapshot $gbdjRun
# The PFR7/PFR8/PFR9/PFO1 host read-only attributes were needed only to make
# DOSBox's own destination open fail during the run just captured; clear them
# now (after, never before, the after-snapshot) so later commits/mutation
# restores in this session are not blocked by a lingering read-only bit.
foreach ($f in $gbdjReadOnlyFiles) { Set-ItemProperty -Path $f -Name IsReadOnly -Value $false }
$gbdjBeforeJson = $gbdjBefore.Files | ConvertTo-Json -Depth 5
$gbdjAfterJson = $gbdjAfter.Files | ConvertTo-Json -Depth 5
if ($gbdjBeforeJson -ne $gbdjAfterJson) {
  throw 'CCHOST /R reader matrix changed a roster, source, token, or journal file (name/size/mtime/hash)'
}
$gbdjDirBeforeJson = $gbdjBefore.Dirs | ConvertTo-Json -Depth 5
$gbdjDirAfterJson = $gbdjAfter.Dirs | ConvertTo-Json -Depth 5
if ($gbdjDirBeforeJson -ne $gbdjDirAfterJson) {
  throw 'CCHOST /R reader matrix changed a directory mtime under the run tree'
}

foreach ($case in $d1Cases) {
  if ($case.Name -eq 'D1H') { continue }  # plan §27.5, amendment K: flipped below, not an "(arguments)" case any more
  $log = (Get-Content (Join-Path $gbdjRun "$($case.Name).LOG") -Raw).Trim()
  $status = (Get-Content (Join-Path $gbdjRun "$($case.Name).STA") -Raw).Trim()
  if ($log -ne 'CCHOST: invalid host request (arguments)' -or $status -ne 'BAD') {
    throw "CCHOST /R argument-shape case $($case.Name) did not reject with the exact arguments diagnostic (got '$log', status '$status')"
  }
}

# D1H: plan §27.5 amendment K, sub-task 9a. Before 9a, a bare roster
# argument with nothing after it was an argument-shape error (old needle:
# "CCHOST: invalid host request (arguments)" / BAD). Amendment K's
# one-argument /R now derives the save directory instead, so D1H clears
# parse_args entirely and reaches the ordinary reader, which reports
# "journal absent" because no C:\X.GDJ exists anywhere in this session --
# the same shape as D1P and GJ01. New needle:
# "CCHOST: effect damage journal absent" / OK. Zero writes and zero
# directory-mtime changes are already covered by the session-wide
# before/after invariants above, which include D1H's row.
$d1hLog = (Get-Content (Join-Path $gbdjRun 'D1H.LOG') -Raw).Trim()
$d1hStatus = (Get-Content (Join-Path $gbdjRun 'D1H.STA') -Raw).Trim()
if ($d1hLog -ne 'CCHOST: effect damage journal absent' -or $d1hStatus -ne 'OK') {  # plan §27.5, amendment K
  throw "CCHOST /R one-argument case D1H did not report the exact journal-absent diagnostic (got '$d1hLog', status '$d1hStatus')"
}

$rjvMrkLog = Get-Content (Join-Path $gbdjRun 'RJVMRK.LOG') -Raw
if ($rjvMrkLog -notlike '*CCHOST: GBDJ reader accepted (test build)*') {
  throw 'CCHOST.GJA did not reach the GBDJ acceptance marker for a well-formed one-member journal (RJV)'
}

$rjv2Log = Get-Content (Join-Path $gbdjRun 'RJV2.LOG') -Raw
if ($rjv2Log -notlike '*CCHOST: GBDJ reader accepted (test build)*') {
  throw 'CCHOST.GJA did not reach the GBDJ acceptance marker for a well-formed two-member journal (RJV2)'
}

$rjs1Log = Get-Content (Join-Path $gbdjRun 'RJS1.LOG') -Raw
if ($rjs1Log -notlike '*CCHOST: GBDJ reader accepted (test build)*') {
  throw 'CCHOST.GJA did not reach the GBDJ acceptance marker for a well-formed v9+sidecar journal (RJS1)'
}
$rjsbLog = Get-Content (Join-Path $gbdjRun 'RJSB.LOG') -Raw
if ($rjsbLog -notlike '*CCHOST: GBDJ reader accepted (test build)*') {
  throw 'CCHOST.GJA did not reach the GBDJ acceptance marker for the largest-legal (count=1213) sidecar journal (RJSB)'
}
$rjsvLog = Get-Content (Join-Path $gbdjRun 'RJSV.LOG') -Raw
if ($rjsvLog -notlike '*CCHOST: GBDJ reader accepted (test build)*') {
  throw 'CCHOST.GJA did not accept the near-boundary v2 sidecar embedded beyond 64 KiB (RJSV)'
}

# D1P: a valid 98-char directory must clear argument parsing (no "(arguments)"
# diagnostic) and fail only because C:\D1P.GDJ does not exist. build_damage_
# journal_path derives the journal path from the ROSTER argument's basename
# (C:\D1P.GPR -> C:\D1P.GDJ), not from the 98-char source-directory argument,
# so the open this hits is an ordinary missing-file open in the real, existing
# C:\ mount root -- exactly the AX=2 case plan §22.5 J.1 gives its own
# diagnostic. Pre-J this shared the generic "(result)" bucket with every other
# open/structural failure; post-J it is unambiguous, which is a strictly
# sharper proof that parse_args accepted the 98-char bound and execution
# reached the file-lookup itself. This flip was not in the plan's row list --
# found only by running the test (see the 7c.1 report).
$d1pLog = (Get-Content (Join-Path $gbdjRun 'D1P.LOG') -Raw).Trim()
$d1pStatus = (Get-Content (Join-Path $gbdjRun 'D1P.STA') -Raw).Trim()
if ($d1pLog -ne 'CCHOST: effect damage journal absent' -or $d1pStatus -ne 'OK') {  # plan §22.5 J.1
  throw "CCHOST /R boundary control D1P did not report the exact journal-absent diagnostic (got '$d1pLog', status '$d1pStatus')"
}

# RJC/RJCM: COMMITTED (G1) is a genuine success -- in both the unmodified
# production build and the marker build -- and never prints the marker,
# because the committed return happens before the marker code is reached.
foreach ($committedName in @('RJC', 'RJCM')) {
  $log = (Get-Content (Join-Path $gbdjRun "$committedName.LOG") -Raw).Trim()
  $status = (Get-Content (Join-Path $gbdjRun "$committedName.STA") -Raw).Trim()
  if ($log -like '*GBDJ reader accepted*') {
    throw "CCHOST unexpectedly printed the test-only GBDJ acceptance marker for COMMITTED case $committedName"
  }
  if ($log -ne 'CCHOST: effect damage already committed' -or $status -ne 'OK') {
    throw "CCHOST /R COMMITTED case $committedName did not succeed with the exact committed diagnostic (got '$log', status '$status')"
  }
}

# plan §22.5 J.1 (checkpoint 13 finding): GJ01 is Write-GbdjCase -SkipJournal,
# i.e. its .GDJ simply does not exist -- the exact AX=2 case J.1 reports as
# 'journal absent', exit 0, in EVERY build (the absent dispatch sits in
# recover_damage, ahead of .reader_ok, so ACCEPT_MARK cannot change it).
# Neither §22.5's row table nor 7c.1's re-audit listed it; the J binary's own
# GJ01.LOG/GJ01P.LOG from a real run showed it. Every other reject name has a
# real (malformed) .GDJ on disk and keeps the reader's '(result)' diagnostic.
$gbdjAbsentRejectNames = @('GJ01')
foreach ($name in $gbdjRejectNames) {
  $log = (Get-Content (Join-Path $gbdjRun "$name.LOG") -Raw).Trim()
  $status = (Get-Content (Join-Path $gbdjRun "$name.STA") -Raw).Trim()
  if ($log -like '*GBDJ reader accepted*') {
    throw "CCHOST.GJA reached the GBDJ acceptance marker for rejection fixture $name"
  }
  if ($gbdjAbsentRejectNames -contains $name) {
    if ($log -ne 'CCHOST: effect damage journal absent' -or $status -ne 'OK') {  # plan §22.5 J.1
      throw "CCHOST.GJA absent-journal fixture $name did not report the exact journal-absent diagnostic (got '$log', status '$status')"
    }
    continue
  }
  if ($log -ne 'CCHOST: invalid host request (result)' -or $status -ne 'BAD') {
    throw "CCHOST.GJA rejection fixture $name did not log the exact reader diagnostic (got '$log', status '$status')"
  }
}

# Preflight positive controls (PF01-PF03) must reach the marker -- proving a
# real destination preflight ran and succeeded, not merely that the reader
# accepted the journal.
foreach ($name in @('PF01', 'PF02', 'PF03')) {
  $log = (Get-Content (Join-Path $gbdjRun "$name.LOG") -Raw).Trim()
  if ($log -notlike '*CCHOST: GBDJ reader accepted (test build)*') {
    throw "CCHOST.GJA did not reach the GBDJ acceptance marker for preflight positive control $name (got '$log')"
  }
}

# Preflight rejects (PFR1-PFR9): must print exactly the NEW preflight
# diagnostic (never the reader's "(result)" string), status BAD, no marker.
foreach ($name in $gbdjPreflightRejectCases) {
  $log = (Get-Content (Join-Path $gbdjRun "$name.LOG") -Raw).Trim()
  $status = (Get-Content (Join-Path $gbdjRun "$name.STA") -Raw).Trim()
  if ($log -like '*GBDJ reader accepted*') {
    throw "CCHOST.GJA reached the GBDJ acceptance marker for preflight rejection fixture $name"
  }
  if ($log -ne 'CCHOST: effect damage recovery target unavailable' -or $status -ne 'BAD') {
    throw "CCHOST /R preflight rejection case $name did not fail with the exact preflight diagnostic (got '$log', status '$status')"
  }
}

# Handle-budget boundary: 5 standard + K held + up to 7 retained <= 20.
$h8Log = (Get-Content (Join-Path $gbdjRun 'H8.LOG') -Raw).Trim()
if ($h8Log -notlike '*CCHOST: GBDJ reader accepted (test build)*') {
  throw "CCHOST.GH8 (K=8) did not reach the GBDJ acceptance marker for the six-target journal PF02 (got '$h8Log')"
}
$h9Log = (Get-Content (Join-Path $gbdjRun 'H9.LOG') -Raw).Trim()
if ($h9Log -ne 'CCHOST: effect damage recovery target unavailable') {
  throw "CCHOST.GH9 (K=9) did not fail with the exact preflight diagnostic for the six-target journal PF02 (got '$h9Log')"
}
$h9fLog = (Get-Content (Join-Path $gbdjRun 'H9F.LOG') -Raw).Trim()
if ($h9fLog -notlike '*CCHOST: GBDJ reader accepted (test build)*') {
  throw "CCHOST.GH9 (K=9) did not reach the GBDJ acceptance marker for the five-target journal H9F (got '$h9fLog')"
}
# The marker above proves the 32-bit embedded seek was accepted. Now recover
# that same near-boundary v2 PREPARED journal with unmodified production code
# in its own disposable mount, and require actual roster/source restoration.
$v2RecoverRun = Join-Path $build 'cchost-gbsl-v2-recovery-test'
if (Test-Path $v2RecoverRun) { Remove-Item -LiteralPath $v2RecoverRun -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $v2RecoverRun 'GJSRC') -Force | Out-Null
Copy-Item (Join-Path $build 'CCHOST.COM') (Join-Path $v2RecoverRun 'CCHOST.COM') -Force
foreach ($extension in @('GPR', 'DOP', 'GDJ', 'EFX', 'GBS')) {
  Copy-Item (Join-Path $gbdjRun "RJSV.$extension") (Join-Path $v2RecoverRun "RJSV.$extension") -Force
}
for ($i = 1; $i -le 6; $i++) {
  Copy-Item (Join-Path $gbdjRun "GJSRC\CHRDATA$i.GAM") (Join-Path $v2RecoverRun "GJSRC\CHRDATA$i.GAM") -Force
}
$v2RosterExpected = [IO.File]::ReadAllBytes((Join-Path $v2RecoverRun 'RJSV.GPR'))
$v2SourceExpected = Get-GbdjRosterRaw $v2RosterExpected 0
$v2RosterDirty = [byte[]]$v2RosterExpected.Clone()
$v2RosterDirty[16 + 1 + 214] = $v2RosterDirty[16 + 1 + 214] -bxor 0x5a
[IO.File]::WriteAllBytes((Join-Path $v2RecoverRun 'RJSV.GPR'), $v2RosterDirty)
$v2SourceDirty = [IO.File]::ReadAllBytes((Join-Path $v2RecoverRun 'GJSRC\CHRDATA1.GAM'))
$v2SourceDirty[214] = $v2SourceExpected[214] -bxor 0x5a
[IO.File]::WriteAllBytes((Join-Path $v2RecoverRun 'GJSRC\CHRDATA1.GAM'), $v2SourceDirty)
$v2RecoveryConf = Join-Path $v2RecoverRun '_v2_recovery.conf'
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[autoexec]
mount C "$v2RecoverRun"
C:
CCHOST /R C:\RJSV.GPR C:\GJSRC > C:\REC.LOG
exit
"@ | Set-Content -Path $v2RecoveryConf -Encoding ASCII
$v2RecoveryProcess = Start-DosBoxSmoke -Dosbox $dosbox -Conf $v2RecoveryConf -Headless:$Headless
if (-not $v2RecoveryProcess.WaitForExit(60000)) {
  Stop-DosBoxSmoke -Process $v2RecoveryProcess
  throw 'CCHOST near-boundary v2 journal recovery timed out'
}
if ((Get-Content (Join-Path $v2RecoverRun 'REC.LOG') -Raw) -notlike '*CCHOST: effect damage recovered*' -or
    [BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $v2RecoverRun 'RJSV.GPR'))) -ne [BitConverter]::ToString($v2RosterExpected) -or
    [BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $v2RecoverRun 'GJSRC\CHRDATA1.GAM'))) -ne [BitConverter]::ToString($v2SourceExpected)) {
  throw 'CCHOST did not recover roster and source from a near-boundary embedded v2 journal'
}
# --- New session: cchost-gbdr-test (plan step 6: /R restores destinations) --
# damage_journal_restore (plan step 6) is the first code in this feature that
# writes player save files. This session proves it: production CCHOST.RJP
# recovers a roster and its present sources through the retained handles
# (RS01-RS08, RH8), never rolls back a COMMITTED journal or a rejected one
# (RS06/RS07/RS08), and ten deliberately-faulted builds (RK*/RT*/RF*/RW2)
# prove every documented crash/tear/fail/short-write outcome converges to the
# correct result on a second, unmodified production run -- the idempotency
# argument in docs/engine/direct-damage-journal-v1.md, exercised for real.
#
# Every fixture path in this session must resolve under $gbdrRun -- never a
# real save. The path-safety guard below throws before DOSBox starts if any
# case's roster/save-dir/effect/token argument maps outside it.
$gbdrRun = Join-Path $build 'cchost-gbdr-test'
if (Test-Path $gbdrRun) { Remove-Item -Recurse -Force $gbdrRun }
New-Item -ItemType Directory -Force $gbdrRun | Out-Null

# Test-only restore fault builds (plan step 6, item 6). Same nasm invocation
# pattern as every other fault fixture in this file. GR8 carries NO accept
# marker (unlike H8/H9 above) -- HOLD_HANDLES is combined with real production
# restore code here, not with the dry-run marker path.
$gbdrK0Com = Join-Path $build 'cchost-gbdj-restore-crash0.com'
& $nasm -f bin -I ((Join-Path $native 'src') + '/') -D CCHOST_TEST_GBDJ_CRASH_AT=0 (Join-Path $native 'src\cchost.asm') -o $gbdrK0Com
if ($LASTEXITCODE -ne 0) { throw 'NASM did not build CCHOST GBDJ restore CRASH_AT=0 fixture' }
$gbdrK1Com = Join-Path $build 'cchost-gbdj-restore-crash1.com'
& $nasm -f bin -I ((Join-Path $native 'src') + '/') -D CCHOST_TEST_GBDJ_CRASH_AT=1 (Join-Path $native 'src\cchost.asm') -o $gbdrK1Com
if ($LASTEXITCODE -ne 0) { throw 'NASM did not build CCHOST GBDJ restore CRASH_AT=1 fixture' }
$gbdrK3Com = Join-Path $build 'cchost-gbdj-restore-crash3.com'
& $nasm -f bin -I ((Join-Path $native 'src') + '/') -D CCHOST_TEST_GBDJ_CRASH_AT=3 (Join-Path $native 'src\cchost.asm') -o $gbdrK3Com
if ($LASTEXITCODE -ne 0) { throw 'NASM did not build CCHOST GBDJ restore CRASH_AT=3 fixture' }
$gbdrK7Com = Join-Path $build 'cchost-gbdj-restore-crash7.com'
& $nasm -f bin -I ((Join-Path $native 'src') + '/') -D CCHOST_TEST_GBDJ_CRASH_AT=7 (Join-Path $native 'src\cchost.asm') -o $gbdrK7Com
if ($LASTEXITCODE -ne 0) { throw 'NASM did not build CCHOST GBDJ restore CRASH_AT=7 fixture' }
$gbdrKeCom = Join-Path $build 'cchost-gbdj-restore-crashend.com'
& $nasm -f bin -I ((Join-Path $native 'src') + '/') -D CCHOST_TEST_GBDJ_CRASH_AT_END=1 (Join-Path $native 'src\cchost.asm') -o $gbdrKeCom
if ($LASTEXITCODE -ne 0) { throw 'NASM did not build CCHOST GBDJ restore CRASH_AT_END fixture' }
$gbdrT0Com = Join-Path $build 'cchost-gbdj-restore-tear0.com'
& $nasm -f bin -I ((Join-Path $native 'src') + '/') -D CCHOST_TEST_GBDJ_TEAR_AT=0 (Join-Path $native 'src\cchost.asm') -o $gbdrT0Com
if ($LASTEXITCODE -ne 0) { throw 'NASM did not build CCHOST GBDJ restore TEAR_AT=0 fixture' }
$gbdrT4Com = Join-Path $build 'cchost-gbdj-restore-tear4.com'
& $nasm -f bin -I ((Join-Path $native 'src') + '/') -D CCHOST_TEST_GBDJ_TEAR_AT=4 (Join-Path $native 'src\cchost.asm') -o $gbdrT4Com
if ($LASTEXITCODE -ne 0) { throw 'NASM did not build CCHOST GBDJ restore TEAR_AT=4 fixture' }
$gbdrF0Com = Join-Path $build 'cchost-gbdj-restore-fail0.com'
& $nasm -f bin -I ((Join-Path $native 'src') + '/') -D CCHOST_TEST_GBDJ_FAIL_AT=0 (Join-Path $native 'src\cchost.asm') -o $gbdrF0Com
if ($LASTEXITCODE -ne 0) { throw 'NASM did not build CCHOST GBDJ restore FAIL_AT=0 fixture' }
$gbdrF5Com = Join-Path $build 'cchost-gbdj-restore-fail5.com'
& $nasm -f bin -I ((Join-Path $native 'src') + '/') -D CCHOST_TEST_GBDJ_FAIL_AT=5 (Join-Path $native 'src\cchost.asm') -o $gbdrF5Com
if ($LASTEXITCODE -ne 0) { throw 'NASM did not build CCHOST GBDJ restore FAIL_AT=5 fixture' }
$gbdrW2Com = Join-Path $build 'cchost-gbdj-restore-short2.com'
& $nasm -f bin -I ((Join-Path $native 'src') + '/') -D CCHOST_TEST_GBDJ_SHORT_AT=2 (Join-Path $native 'src\cchost.asm') -o $gbdrW2Com
if ($LASTEXITCODE -ne 0) { throw 'NASM did not build CCHOST GBDJ restore SHORT_AT=2 fixture' }
$gbdrGr8Com = Join-Path $build 'cchost-gbdj-restore-hold8.com'
& $nasm -f bin -I ((Join-Path $native 'src') + '/') -D CCHOST_TEST_GBDJ_HOLD_HANDLES=8 (Join-Path $native 'src\cchost.asm') -o $gbdrGr8Com
if ($LASTEXITCODE -ne 0) { throw 'NASM did not build CCHOST GBDJ restore HOLD_HANDLES=8 (no marker) fixture' }

Copy-Item (Join-Path $build 'cchost.com') (Join-Path $gbdrRun 'CCHOST.RJP') -Force
Copy-Item (Join-Path $build 'cchost.com') (Join-Path $gbdrRun 'CCHOST.COM') -Force
Copy-Item $gbdrK0Com (Join-Path $gbdrRun 'CCHOST.K0') -Force
Copy-Item $gbdrK1Com (Join-Path $gbdrRun 'CCHOST.K1') -Force
Copy-Item $gbdrK3Com (Join-Path $gbdrRun 'CCHOST.K3') -Force
Copy-Item $gbdrK7Com (Join-Path $gbdrRun 'CCHOST.K7') -Force
Copy-Item $gbdrKeCom (Join-Path $gbdrRun 'CCHOST.KE') -Force
Copy-Item $gbdrT0Com (Join-Path $gbdrRun 'CCHOST.T0') -Force
Copy-Item $gbdrT4Com (Join-Path $gbdrRun 'CCHOST.T4') -Force
Copy-Item $gbdrF0Com (Join-Path $gbdrRun 'CCHOST.F0') -Force
Copy-Item $gbdrF5Com (Join-Path $gbdrRun 'CCHOST.F5') -Force
Copy-Item $gbdrW2Com (Join-Path $gbdrRun 'CCHOST.W2') -Force
Copy-Item $gbdrGr8Com (Join-Path $gbdrRun 'CCHOST.GR8') -Force

# --- Content-construction helpers (brief "Content construction (PowerShell)") -
function New-GbdrSlotPreimage([byte]$Slot) {
  $buf = New-Object byte[] 216
  for ($i = 0; $i -lt 216; $i++) { $buf[$i] = [byte](($Slot * 37 + $i * 11 + 5) -band 0xFF) }
  $buf[40] = [byte]((0x50 + $Slot) -band 0xFF)
  $buf[214] = [byte]((0x30 + $Slot) -band 0xFF)
  return ,$buf
}
function New-GbdrDamagedBytes([byte[]]$P) {
  $d = New-Object byte[] $P.Length
  for ($i = 0; $i -lt $P.Length; $i++) { $d[$i] = [byte]($P[$i] -bxor 0xA5) }
  return ,$d
}
function New-GbdrSplice([byte[]]$First, [byte[]]$Second, [int]$FirstCount) {
  $buf = New-Object byte[] $First.Length
  [Array]::Copy($First, 0, $buf, 0, $FirstCount)
  [Array]::Copy($Second, $FirstCount, $buf, $FirstCount, $First.Length - $FirstCount)
  return ,$buf
}
function New-GbdrInterleave([byte[]]$Even, [byte[]]$Odd) {
  $buf = New-Object byte[] $Even.Length
  for ($i = 0; $i -lt $Even.Length; $i++) { $buf[$i] = if ($i % 2 -eq 0) { $Even[$i] } else { $Odd[$i] } }
  return ,$buf
}
# Roster preimage: New-GbdjRoster (existing helper) of the case's slot list,
# with each member's 216-byte raw area filled with that slot's preimage.
function New-GbdrRosterWithPreimages([byte[]]$Slots) {
  $roster = New-GbdjRoster $Slots
  for ($i = 0; $i -lt $Slots.Length; $i++) {
    $off = 16 + ($i * 410)
    $p = New-GbdrSlotPreimage $Slots[$i]
    [Array]::Copy($p, 0, $roster, $off + 1, 216)
  }
  return ,$roster
}

$gbdrDerangement = [byte[]](3, 6, 1, 5, 2, 4)

# Path-safety guard bookkeeping: every case appends its own DOS-side argument
# set here; checked against $gbdrRun right before DOSBox starts.
$gbdrCaseArgs = @()
function ConvertTo-GbdrLocalPath([string]$Arg) { return Join-Path $gbdrRun ($Arg.Substring(3)) }
function Assert-GbdrPathInside([string]$Arg, [string]$Label) {
  if ($null -eq $Arg) { return }
  $local = ConvertTo-GbdrLocalPath $Arg
  $full = [IO.Path]::GetFullPath($local)
  $base = [IO.Path]::GetFullPath($gbdrRun)
  $ok = $full.Equals($base, [StringComparison]::OrdinalIgnoreCase) -or
        $full.StartsWith($base + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
  if (-not $ok) { throw "GBDR path-safety guard: $Label argument '$Arg' resolves outside $gbdrRun (got '$full')" }
}

# One case = one directory C:\<Name> with R.GPR / R.GDJ / SAVE\CHRDATA<n>.GAM /
# E.EFX (+ E.GBS) / E.DOP, plus root-level snapshot dirs <Name>M / <Name>A.
# Default on-disk content is "damaged" (D = P xor 0xA5) everywhere; a case
# overrides -RosterDisk / -SourceDisk (keyed by 0-based ordinal) for anything
# else (RS01's realistic damage, RS04's per-unit scrambles, RS05's identity).
function New-GbdrCase {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][byte[]]$Slots,
    [Parameter(Mandatory)][UInt16]$Mask,
    [UInt16]$State = 0,
    [UInt32]$EffectExtent = 5920,
    [UInt32]$GbslExtent = 0,
    [switch]$SkipToken,
    [switch]$SkipCurrentEffect,
    [byte[]]$CurrentEffectBytes = $null,
    [byte[]]$RosterDisk = $null,
    [hashtable]$SourceDisk = @{},
    [hashtable]$UntargetedPresent = @{},
    [UInt64]$Generation = 1,
    [switch]$LegacyRoster
  )
  $dir = Join-Path $gbdrRun $Name
  $saveDir = Join-Path $dir 'SAVE'
  New-Item -ItemType Directory -Force $dir | Out-Null
  New-Item -ItemType Directory -Force $saveDir | Out-Null
  New-Item -ItemType Directory -Force (Join-Path $gbdrRun "${Name}M") | Out-Null
  New-Item -ItemType Directory -Force (Join-Path $gbdrRun "${Name}A") | Out-Null

  $rosterArg = "C:\$Name\R.GPR"
  $saveArg = "C:\$Name\SAVE"
  $tokenArg = "C:\$Name\E.DOP"
  $effectArg = "C:\$Name\E.EFX"
  Assert-GbdrPathInside $rosterArg "$Name roster"
  Assert-GbdrPathInside $saveArg "$Name save dir"
  Assert-GbdrPathInside $tokenArg "$Name token"
  Assert-GbdrPathInside $effectArg "$Name effect"

  $gbpr = New-GbdrRosterWithPreimages $Slots
  if ($LegacyRoster) {
    Set-U16 $gbpr 4 1
    Set-U32 $gbpr 12 0
  }
  $count = $Slots.Length
  $entries = @()
  for ($i = 0; $i -lt 6; $i++) {
    $targeted = ($Mask -band (1 -shl $i)) -ne 0
    if ($targeted -and $i -lt $count) {
      $entries += ,(New-GbdjSourceEntry 1 $Slots[$i] (New-GbdrSlotPreimage $Slots[$i]))
    } else {
      $entries += ,(New-GbdjSourceEntry 0 0 $null)
    }
  }

  $effectVersion = if ($EffectExtent -eq 5750) { 9 } else { 14 }
  $sideFlag = if ($GbslExtent -gt 0) { 0x0100 } else { 0 }
  $effectBytes = New-GbefBytes -Version $effectVersion -Flags $sideFlag -Extent $EffectExtent
  $gbslBytes = $null
  if ($GbslExtent -gt 0) { $gbslBytes = New-GbslBytes -Count ([Math]::Floor(($GbslExtent - 8) / 54)) -Extent $GbslExtent }

  $journalParams = @{
    RosterPath = $rosterArg; SourceDirPath = $saveArg; TokenPath = $tokenArg; EffectPath = $effectArg
    Gbpr = $gbpr; Mask = $Mask; State = $State; Sources = $entries; EffectExtent = $EffectExtent
    EffectBytes = $effectBytes; Generation = $Generation
  }
  if ($GbslExtent -gt 0) { $journalParams['GbslExtent'] = $GbslExtent; $journalParams['GbslBytes'] = $gbslBytes }
  $journal = New-DamageJournal @journalParams
  [IO.File]::WriteAllBytes((Join-Path $dir 'R.GDJ'), $journal)

  if (-not $SkipToken) { [IO.File]::WriteAllBytes((Join-Path $dir 'E.DOP'), (New-OperationToken $Generation)) }
  if (-not $SkipCurrentEffect) {
    $curEffect = if ($null -ne $CurrentEffectBytes) { $CurrentEffectBytes } else { $effectBytes }
    [IO.File]::WriteAllBytes((Join-Path $dir 'E.EFX'), $curEffect)
  }
  if ($GbslExtent -gt 0) { [IO.File]::WriteAllBytes((Join-Path $dir 'E.GBS'), $gbslBytes) }

  $rosterDiskBytes = if ($null -ne $RosterDisk) { $RosterDisk } else { New-GbdrDamagedBytes $gbpr }
  [IO.File]::WriteAllBytes((Join-Path $dir 'R.GPR'), $rosterDiskBytes)

  for ($i = 0; $i -lt $count; $i++) {
    $targeted = ($Mask -band (1 -shl $i)) -ne 0
    $slot = $Slots[$i]
    $file = Join-Path $saveDir "CHRDATA$slot.GAM"
    if ($targeted) {
      $p = New-GbdrSlotPreimage $slot
      $bytes = if ($SourceDisk.ContainsKey($i)) { $SourceDisk[$i] } else { New-GbdrDamagedBytes $p }
      [IO.File]::WriteAllBytes($file, $bytes)
    } elseif ($UntargetedPresent.ContainsKey($i)) {
      [IO.File]::WriteAllBytes($file, $UntargetedPresent[$i])
    }
  }

  $case = @{
    Name = $Name; Dir = $dir; SaveDir = $saveDir; RosterArg = $rosterArg; SaveArg = $saveArg
    EffectArg = $effectArg; TokenArg = $tokenArg; Gbpr = $gbpr; Slots = $Slots; Mask = $Mask
  }
  $script:gbdrCaseArgs += ,$case
  return $case
}

# --- Positive and control cases (run under production CCHOST.RJP) -----------
$rs01Gbpr = New-GbdrRosterWithPreimages ([byte[]](3))
# Dedicated legacy-journal recovery control; new producers use v2 DoK.
Set-U16 $rs01Gbpr 4 1
Set-U32 $rs01Gbpr 12 0
$rs01RosterDisk = [byte[]]$rs01Gbpr.Clone()
Set-U16 $rs01RosterDisk (16 + 1 + 216 + 6) 13
$rs01P3 = New-GbdrSlotPreimage 3
$rs01SourceDisk = [byte[]]$rs01P3.Clone()
$rs01SourceDisk[40] = [byte](($rs01SourceDisk[40] - 7) -band 0xFF)
$rs01SourceDisk[214] = [byte](($rs01SourceDisk[214] - 7) -band 0xFF)
$rs01 = New-GbdrCase -Name 'RS01' -Slots ([byte[]](3)) -Mask 1 -RosterDisk $rs01RosterDisk -SourceDisk @{ 0 = $rs01SourceDisk } -LegacyRoster

$rs02 = New-GbdrCase -Name 'RS02' -Slots $gbdrDerangement -Mask 0x3F -EffectExtent 5750 -GbslExtent 65510
$rs02JournalLen = (Get-Item (Join-Path $rs02.Dir 'R.GDJ')).Length
if ($rs02JournalLen -le 65536) { throw "RS02 journal expected to exceed 64 KiB, got $rs02JournalLen" }

$rs03Fill = New-Object byte[] 216
for ($i = 0; $i -lt 216; $i++) { $rs03Fill[$i] = 0xEE }
$rs03 = New-GbdrCase -Name 'RS03' -Slots ([byte[]](4, 2, 6)) -Mask 2 -UntargetedPresent @{ 0 = $rs03Fill; 2 = $rs03Fill }

# RS04: pre-scrambled per-unit states on an otherwise well-formed DR/v14 case.
# Ordinals under $gbdrDerangement = {3,6,1,5,2,4}: u1=slot3, u2=slot6, u3=slot1,
# u4=slot5, u5=slot2, u6=slot4.
$rs04Gbpr = New-GbdrRosterWithPreimages $gbdrDerangement
$rs04P1 = New-GbdrSlotPreimage 1; $rs04D1 = New-GbdrDamagedBytes $rs04P1
$rs04P2 = New-GbdrSlotPreimage 2; $rs04D2 = New-GbdrDamagedBytes $rs04P2
$rs04P4 = New-GbdrSlotPreimage 4
$rs04P5 = New-GbdrSlotPreimage 5; $rs04D5 = New-GbdrDamagedBytes $rs04P5
$rs04P6 = New-GbdrSlotPreimage 6
$rs04SourceDisk = @{
  2 = (New-GbdrSplice $rs04P1 $rs04D1 108)   # ordinal2 = slot1: first 108 P then D
  3 = (New-GbdrSplice $rs04D5 $rs04P5 108)   # ordinal3 = slot5: first 108 D then P
  4 = (New-GbdrInterleave $rs04P2 $rs04D2)   # ordinal4 = slot2: even P, odd D
  5 = $rs04P4                                # ordinal5 = slot4: already P
  1 = $rs04P6                                # ordinal1 = slot6: already P
}
$rs04 = New-GbdrCase -Name 'RS04' -Slots $gbdrDerangement -Mask 0x3F -RosterDisk $rs04Gbpr -SourceDisk $rs04SourceDisk

$rs05Gbpr = New-GbdrRosterWithPreimages $gbdrDerangement
$rs05SourceDisk = @{}
for ($i = 0; $i -lt 6; $i++) { $rs05SourceDisk[$i] = New-GbdrSlotPreimage $gbdrDerangement[$i] }
$rs05 = New-GbdrCase -Name 'RS05' -Slots $gbdrDerangement -Mask 0x3F -RosterDisk $rs05Gbpr -SourceDisk $rs05SourceDisk

$rs06 = New-GbdrCase -Name 'RS06' -Slots $gbdrDerangement -Mask 0x3F -State 1 -SkipToken -SkipCurrentEffect

$rs07 = New-GbdrCase -Name 'RS07' -Slots $gbdrDerangement -Mask 0x3F
$rs07ReadOnlyFile = Join-Path $rs07.SaveDir 'CHRDATA4.GAM'   # ordinal 5 of the derangement = slot 4
Set-ItemProperty -Path $rs07ReadOnlyFile -Name IsReadOnly -Value $true

$rs08Effect = New-GbefBytes -Version 14 -Flags 0 -Extent 5920
$rs08Effect[100] = $rs08Effect[100] -bxor 0xFF
$rs08 = New-GbdrCase -Name 'RS08' -Slots $gbdrDerangement -Mask 0x3F -CurrentEffectBytes $rs08Effect

$rh8 = New-GbdrCase -Name 'RH8' -Slots $gbdrDerangement -Mask 0x3F

$gbdrReadOnlyFiles = @($rs07ReadOnlyFile)

# --- Fault cases (each DR/v14/all-D; run under a fault build then twice under
# production) -----------------------------------------------------------------
$rk0 = New-GbdrCase -Name 'RK0' -Slots $gbdrDerangement -Mask 0x3F
$rk1 = New-GbdrCase -Name 'RK1' -Slots $gbdrDerangement -Mask 0x3F
$rk3 = New-GbdrCase -Name 'RK3' -Slots $gbdrDerangement -Mask 0x3F
$rk7 = New-GbdrCase -Name 'RK7' -Slots $gbdrDerangement -Mask 0x3F
$rke = New-GbdrCase -Name 'RKE' -Slots $gbdrDerangement -Mask 0x3F
$rt0 = New-GbdrCase -Name 'RT0' -Slots $gbdrDerangement -Mask 0x3F
$rt4 = New-GbdrCase -Name 'RT4' -Slots $gbdrDerangement -Mask 0x3F
$rf0 = New-GbdrCase -Name 'RF0' -Slots $gbdrDerangement -Mask 0x3F
$rf5 = New-GbdrCase -Name 'RF5' -Slots $gbdrDerangement -Mask 0x3F
$rw2 = New-GbdrCase -Name 'RW2' -Slots $gbdrDerangement -Mask 0x3F

# --- Path-safety guard: run before DOSBox starts -----------------------------
foreach ($c in $gbdrCaseArgs) {
  Assert-GbdrPathInside $c.RosterArg "$($c.Name) roster (post-build check)"
  Assert-GbdrPathInside $c.SaveArg "$($c.Name) save dir (post-build check)"
  Assert-GbdrPathInside $c.EffectArg "$($c.Name) effect (post-build check)"
  Assert-GbdrPathInside $c.TokenArg "$($c.Name) token (post-build check)"
}

# --- Batch construction -------------------------------------------------------
function Add-GbdrCommand([string]$Name, [string]$Command) {
  [void]$gbdrBatch.AppendLine("$Command > C:\$Name.LOG")
  [void]$gbdrBatch.AppendLine("if errorlevel 8 goto ${Name}_x")
  [void]$gbdrBatch.AppendLine("if errorlevel 7 goto ${Name}_crash")
  [void]$gbdrBatch.AppendLine("if errorlevel 1 goto ${Name}_bad")
  [void]$gbdrBatch.AppendLine("echo OK>C:\$Name.STA")
  [void]$gbdrBatch.AppendLine("goto ${Name}_done")
  [void]$gbdrBatch.AppendLine(":${Name}_x")
  [void]$gbdrBatch.AppendLine("echo OTHER>C:\$Name.STA")
  [void]$gbdrBatch.AppendLine("goto ${Name}_done")
  [void]$gbdrBatch.AppendLine(":${Name}_crash")
  [void]$gbdrBatch.AppendLine("echo CRASH>C:\$Name.STA")
  [void]$gbdrBatch.AppendLine("goto ${Name}_done")
  [void]$gbdrBatch.AppendLine(":${Name}_bad")
  [void]$gbdrBatch.AppendLine("echo BAD>C:\$Name.STA")
  [void]$gbdrBatch.AppendLine(":${Name}_done")
}
function Add-GbdrCopyToSnapshot([hashtable]$Case, [string]$SnapSuffix) {
  $snap = "C:\$($Case.Name)$SnapSuffix"
  [void]$gbdrBatch.AppendLine("copy C:\$($Case.Name)\R.GPR $snap > nul")
  [void]$gbdrBatch.AppendLine("copy C:\$($Case.Name)\SAVE\*.* $snap > nul")
}
function Add-GbdrCaseCommand([hashtable]$Case, [string]$Name) {
  Add-GbdrCommand $Name "CCHOST /R $($Case.RosterArg) $($Case.SaveArg)"
}

$gbdrBatch = [Text.StringBuilder]::new()
[void]$gbdrBatch.AppendLine('copy C:\CCHOST.RJP C:\CCHOST.COM > nul')

Add-GbdrCaseCommand $rs01 'RS01_R1'
Add-GbdrCopyToSnapshot $rs01 'A'
Add-GbdrCaseCommand $rs01 'RS01_R2'

Add-GbdrCaseCommand $rs02 'RS02_R1'
Add-GbdrCopyToSnapshot $rs02 'A'
Add-GbdrCaseCommand $rs02 'RS02_R2'

Add-GbdrCaseCommand $rs03 'RS03_R1'
Add-GbdrCopyToSnapshot $rs03 'A'
Add-GbdrCaseCommand $rs03 'RS03_R2'

Add-GbdrCaseCommand $rs04 'RS04'

Add-GbdrCaseCommand $rs05 'RS05_R1'
Add-GbdrCopyToSnapshot $rs05 'A'
Add-GbdrCaseCommand $rs05 'RS05_R2'

Add-GbdrCaseCommand $rs06 'RS06'
Add-GbdrCaseCommand $rs07 'RS07'
Add-GbdrCaseCommand $rs08 'RS08'

[void]$gbdrBatch.AppendLine('copy C:\CCHOST.GR8 C:\CCHOST.COM > nul')
Add-GbdrCaseCommand $rh8 'RH8'
[void]$gbdrBatch.AppendLine('copy C:\CCHOST.RJP C:\CCHOST.COM > nul')

# Fault cases: (1) fault build -> copy to <C>M, (2) production /R -> copy to
# <C>A, (3) production /R again.
$gbdrFaultCases = @(
  @{ Case = $rk0; Build = 'CCHOST.K0' }, @{ Case = $rk1; Build = 'CCHOST.K1' }
  @{ Case = $rk3; Build = 'CCHOST.K3' }, @{ Case = $rk7; Build = 'CCHOST.K7' }
  @{ Case = $rke; Build = 'CCHOST.KE' }, @{ Case = $rt0; Build = 'CCHOST.T0' }
  @{ Case = $rt4; Build = 'CCHOST.T4' }, @{ Case = $rf0; Build = 'CCHOST.F0' }
  @{ Case = $rf5; Build = 'CCHOST.F5' }, @{ Case = $rw2; Build = 'CCHOST.W2' }
)
foreach ($fc in $gbdrFaultCases) {
  $name = $fc.Case.Name
  [void]$gbdrBatch.AppendLine("copy C:\$($fc.Build) C:\CCHOST.COM > nul")
  Add-GbdrCaseCommand $fc.Case "${name}_RUN1"
  Add-GbdrCopyToSnapshot $fc.Case 'M'
  [void]$gbdrBatch.AppendLine('copy C:\CCHOST.RJP C:\CCHOST.COM > nul')
  Add-GbdrCaseCommand $fc.Case "${name}_RUN2"
  Add-GbdrCopyToSnapshot $fc.Case 'A'
  Add-GbdrCaseCommand $fc.Case "${name}_RUN3"
}
[IO.File]::WriteAllText((Join-Path $gbdrRun 'GBDRCHK.BAT'), $gbdrBatch.ToString(), [Text.Encoding]::ASCII)

$gbdrConf = Join-Path $gbdrRun '_cchost-gbdr.conf'
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[autoexec]
mount C "$gbdrRun"
C:
call C:\GBDRCHK.BAT
exit
"@ | Set-Content -Path $gbdrConf -Encoding ASCII

# --- Snapshot (excludes <C>M/<C>A, *.LOG, *.STA, CCHOST.*, stdout/stderr) ----
function Get-GbdrSnapshot([string]$Dir) {
  $files = Get-ChildItem -Path $Dir -Recurse -File | Where-Object {
    $_.Extension -notin @('.LOG', '.STA') -and $_.Name -notlike 'CCHOST.*' -and
    $_.Name -notin @('stdout.txt', 'stderr.txt') -and
    $_.FullName -notmatch '\\[A-Z0-9]+[MA]\\'
  }
  $fileSnap = foreach ($f in $files) {
    [PSCustomObject]@{
      Path = $f.FullName.Substring($Dir.Length); Size = $f.Length
      LastWriteTimeUtc = $f.LastWriteTimeUtc.Ticks
      Hash = (Get-FileHash -Path $f.FullName -Algorithm SHA256).Hash
    }
  }
  $dirs = Get-ChildItem -Path $Dir -Recurse -Directory | Where-Object { $_.Name -notmatch '^[A-Z0-9]+[MA]$' }
  $dirSnap = foreach ($d in $dirs) {
    [PSCustomObject]@{ Path = $d.FullName.Substring($Dir.Length); LastWriteTimeUtc = $d.LastWriteTimeUtc.Ticks }
  }
  return @{ Files = @($fileSnap | Sort-Object Path); Dirs = @($dirSnap | Sort-Object Path) }
}

$gbdrBefore = Get-GbdrSnapshot $gbdrRun
$gbdrProcess = Start-DosBoxSmoke -Dosbox $dosbox -Conf $gbdrConf -Headless:$Headless
if (-not $gbdrProcess.WaitForExit(180000)) {
  Stop-DosBoxSmoke -Process $gbdrProcess
  throw 'DOSBox did not exit while running the CCHOST GBDR restore matrix'
}
$gbdrAfter = Get-GbdrSnapshot $gbdrRun
# Read-only attributes are needed only to make DOSBox's own open fail during
# the run just captured; clear them after (never before) the after-snapshot.
foreach ($f in $gbdrReadOnlyFiles) { Set-ItemProperty -Path $f -Name IsReadOnly -Value $false }

$gbdrBeforeMap = @{}; foreach ($f in $gbdrBefore.Files) { $gbdrBeforeMap[$f.Path] = $f }
$gbdrAfterMap = @{}; foreach ($f in $gbdrAfter.Files) { $gbdrAfterMap[$f.Path] = $f }
# plan §22.5 J.2: these 16 cases each reach a genuine successful PREPARED
# restore (RS01-RS05 and RH8 on their first/only production run; every
# fault case on RUN2), so their R.GDJ is legitimately retired (deleted) by
# that run and must NOT be flagged as an invariant violation. RS06/RS07/
# RS08 never restore (COMMITTED short-circuit / preflight reject / reader
# reject) and are excluded on purpose -- their journals are unaffected.
$gbdrRetiredJournalCases = @($rs01, $rs02, $rs03, $rs04, $rs05, $rh8, $rk0, $rk1, $rk3, $rk7, $rke, $rt0, $rt4, $rf0, $rf5, $rw2)
$gbdrRetiredJournalPaths = @($gbdrRetiredJournalCases | ForEach-Object { "\$($_.Name)\R.GDJ" })
foreach ($path in $gbdrBeforeMap.Keys) {
  $b = $gbdrBeforeMap[$path]
  $a = $gbdrAfterMap[$path]
  if ($null -eq $a) {
    if ($gbdrRetiredJournalPaths -contains $path) { continue }
    throw "GBDR invariant: file disappeared: $path"
  }
  $ext = [IO.Path]::GetExtension($path)
  if ($ext -in @('.GDJ', '.DOP', '.EFX', '.GBS')) {
    if ($b.Size -ne $a.Size -or $b.Hash -ne $a.Hash -or $b.LastWriteTimeUtc -ne $a.LastWriteTimeUtc) {
      throw "GBDR invariant: journal/token/effect/sidecar file changed: $path"
    }
  } else {
    if ($b.Size -ne $a.Size) { throw "GBDR invariant: destination size changed: $path" }
  }
}
foreach ($path in $gbdrAfterMap.Keys) {
  if (-not $gbdrBeforeMap.ContainsKey($path)) { throw "GBDR invariant: unexpected new file: $path" }
}
# The tolerance above must not silently mask a retire that never actually
# happened: prove each named journal is genuinely gone, not merely absent
# from "after" because it was never captured in "before" for some other
# reason.
foreach ($path in $gbdrRetiredJournalPaths) {
  if (-not $gbdrBeforeMap.ContainsKey($path)) { throw "GBDR invariant: retired-journal path missing from before-snapshot: $path" }
  if ($gbdrAfterMap.ContainsKey($path)) { throw "GBDR invariant: expected retired journal still present: $path" }
}
# plan §22.5 J.2 (checkpoint 13 finding): deleting <C>\R.GDJ necessarily
# moves the mtime of that case's own directory, so exactly those 16 case
# directories are exempt from the mtime pin (the file-level checks above
# already prove their journal is gone). Every other directory is still
# pinned, and the directory SET must still be identical.
$gbdrRetiredJournalDirs = @($gbdrRetiredJournalCases | ForEach-Object { "\$($_.Name)" })
$gbdrDirBeforeMap = @{}; foreach ($d in $gbdrBefore.Dirs) { $gbdrDirBeforeMap[$d.Path] = $d.LastWriteTimeUtc }
$gbdrDirAfterMap = @{}; foreach ($d in $gbdrAfter.Dirs) { $gbdrDirAfterMap[$d.Path] = $d.LastWriteTimeUtc }
foreach ($dp in $gbdrDirBeforeMap.Keys) {
  if (-not $gbdrDirAfterMap.ContainsKey($dp)) { throw "GBDR invariant: directory disappeared: $dp" }
  if ($gbdrRetiredJournalDirs -contains $dp) { continue }
  if ($gbdrDirBeforeMap[$dp] -ne $gbdrDirAfterMap[$dp]) {
    throw "GBDR invariant: a directory mtime changed under the run tree: $dp"
  }
}
foreach ($dp in $gbdrDirAfterMap.Keys) {
  if (-not $gbdrDirBeforeMap.ContainsKey($dp)) { throw "GBDR invariant: unexpected new directory: $dp" }
}
foreach ($dp in $gbdrRetiredJournalDirs) {
  if (-not $gbdrDirBeforeMap.ContainsKey($dp)) { throw "GBDR invariant: retired-journal case directory missing from before-snapshot: $dp" }
}
function Assert-GbdrFullyUnchanged([hashtable]$Case, [string]$Label) {
  foreach ($relPath in @("\$($Case.Name)\R.GPR")) {
    $b = $gbdrBeforeMap[$relPath]; $a = $gbdrAfterMap[$relPath]
    if ($null -eq $b -or $null -eq $a) { throw "$Label snapshot missing: $relPath" }
    if ($b.Size -ne $a.Size -or $b.Hash -ne $a.Hash -or $b.LastWriteTimeUtc -ne $a.LastWriteTimeUtc) {
      throw "$Label R.GPR changed unexpectedly"
    }
  }
  for ($i = 0; $i -lt $Case.Slots.Length; $i++) {
    if (($Case.Mask -band (1 -shl $i)) -ne 0) {
      $relPath = "\$($Case.Name)\SAVE\CHRDATA$($Case.Slots[$i]).GAM"
      $b = $gbdrBeforeMap[$relPath]; $a = $gbdrAfterMap[$relPath]
      if ($null -eq $b -or $null -eq $a) { throw "$Label snapshot missing: $relPath" }
      if ($b.Size -ne $a.Size -or $b.Hash -ne $a.Hash -or $b.LastWriteTimeUtc -ne $a.LastWriteTimeUtc) {
        throw "$Label CHRDATA$($Case.Slots[$i]) changed unexpectedly"
      }
    }
  }
}
Assert-GbdrFullyUnchanged $rs06 'RS06 (COMMITTED, no rollback)'
Assert-GbdrFullyUnchanged $rs07 'RS07 (preflight reject)'
Assert-GbdrFullyUnchanged $rs08 'RS08 (reader reject)'
foreach ($relPath in @("\RS03\SAVE\CHRDATA4.GAM", "\RS03\SAVE\CHRDATA6.GAM")) {
  $b = $gbdrBeforeMap[$relPath]; $a = $gbdrAfterMap[$relPath]
  if ($null -eq $b -or $null -eq $a) { throw "RS03 untargeted snapshot missing: $relPath" }
  if ($b.Size -ne $a.Size -or $b.Hash -ne $a.Hash -or $b.LastWriteTimeUtc -ne $a.LastWriteTimeUtc) {
    throw "RS03 untargeted destination changed unexpectedly: $relPath"
  }
}

# --- Assertion helpers over on-disk content ----------------------------------
function Test-GbdrBytesEqual([string]$Path, [byte[]]$Expected, [string]$Label) {
  if (-not (Test-Path $Path)) { throw "$Label missing: $Path" }
  $actual = [IO.File]::ReadAllBytes($Path)
  if ($actual.Length -ne $Expected.Length) { throw "$Label length mismatch: expected $($Expected.Length), got $($actual.Length) ($Path)" }
  for ($i = 0; $i -lt $actual.Length; $i++) {
    if ($actual[$i] -ne $Expected[$i]) {
      throw "$Label byte mismatch at offset ${i}: expected 0x$($Expected[$i].ToString('X2')), got 0x$($actual[$i].ToString('X2')) ($Path)"
    }
  }
}
function Assert-GbdrAllEqualP([hashtable]$Case, [string]$RosterPath, [string]$SaveDirPath, [string]$Label) {
  Test-GbdrBytesEqual $RosterPath $Case.Gbpr "$Label R.GPR"
  for ($i = 0; $i -lt $Case.Slots.Length; $i++) {
    if (($Case.Mask -band (1 -shl $i)) -ne 0) {
      $slot = $Case.Slots[$i]
      $p = New-GbdrSlotPreimage $slot
      Test-GbdrBytesEqual (Join-Path $SaveDirPath "CHRDATA$slot.GAM") $p "$Label CHRDATA$slot"
    }
  }
}
function Get-GbdrLogStatus([string]$Name) {
  # A crashed run's LOG is created by DOS redirection before the crash, so it
  # is a genuine 0-byte file; Get-Content -Raw returns $null for that, not ''.
  $logRaw = Get-Content (Join-Path $gbdrRun "$Name.LOG") -Raw
  $log = if ($null -eq $logRaw) { '' } else { $logRaw.Trim() }
  $sta = (Get-Content (Join-Path $gbdrRun "$Name.STA") -Raw).Trim()
  return @{ Log = $log; Status = $sta }
}
function Assert-GbdrOutcome([string]$Name, [string]$ExpectedLog, [string]$ExpectedStatus) {
  $r = Get-GbdrLogStatus $Name
  if ($r.Log -ne $ExpectedLog -or $r.Status -ne $ExpectedStatus) {
    throw "GBDR case $Name expected log '$ExpectedLog' status '$ExpectedStatus', got log '$($r.Log)' status '$($r.Status)'"
  }
}

# --- RS01/02/03/05: twice; RS01A/etc and the final in-place state both == P -
Assert-GbdrOutcome 'RS01_R1' 'CCHOST: effect damage recovered' 'OK'
Assert-GbdrOutcome 'RS01_R2' 'CCHOST: effect damage journal absent' 'OK'  # plan §22.5 J.1
Assert-GbdrAllEqualP $rs01 (Join-Path $gbdrRun 'RS01A\R.GPR') (Join-Path $gbdrRun 'RS01A') 'RS01 <C>A'
Assert-GbdrAllEqualP $rs01 (Join-Path $rs01.Dir 'R.GPR') $rs01.SaveDir 'RS01 final'

Assert-GbdrOutcome 'RS02_R1' 'CCHOST: effect damage recovered' 'OK'
Assert-GbdrOutcome 'RS02_R2' 'CCHOST: effect damage journal absent' 'OK'  # plan §22.5 J.1
Assert-GbdrAllEqualP $rs02 (Join-Path $gbdrRun 'RS02A\R.GPR') (Join-Path $gbdrRun 'RS02A') 'RS02 <C>A'
Assert-GbdrAllEqualP $rs02 (Join-Path $rs02.Dir 'R.GPR') $rs02.SaveDir 'RS02 final'

Assert-GbdrOutcome 'RS03_R1' 'CCHOST: effect damage recovered' 'OK'
Assert-GbdrOutcome 'RS03_R2' 'CCHOST: effect damage journal absent' 'OK'  # plan §22.5 J.1
Assert-GbdrAllEqualP $rs03 (Join-Path $gbdrRun 'RS03A\R.GPR') (Join-Path $gbdrRun 'RS03A') 'RS03 <C>A'
Assert-GbdrAllEqualP $rs03 (Join-Path $rs03.Dir 'R.GPR') $rs03.SaveDir 'RS03 final'

Assert-GbdrOutcome 'RS04' 'CCHOST: effect damage recovered' 'OK'
Assert-GbdrAllEqualP $rs04 (Join-Path $rs04.Dir 'R.GPR') $rs04.SaveDir 'RS04 final'

Assert-GbdrOutcome 'RS05_R1' 'CCHOST: effect damage recovered' 'OK'
Assert-GbdrOutcome 'RS05_R2' 'CCHOST: effect damage journal absent' 'OK'  # plan §22.5 J.1
Assert-GbdrAllEqualP $rs05 (Join-Path $gbdrRun 'RS05A\R.GPR') (Join-Path $gbdrRun 'RS05A') 'RS05 <C>A'
Assert-GbdrAllEqualP $rs05 (Join-Path $rs05.Dir 'R.GPR') $rs05.SaveDir 'RS05 final'

Assert-GbdrOutcome 'RS06' 'CCHOST: effect damage already committed' 'OK'
Assert-GbdrOutcome 'RS07' 'CCHOST: effect damage recovery target unavailable' 'BAD'
Assert-GbdrOutcome 'RS08' 'CCHOST: invalid host request (result)' 'BAD'

Assert-GbdrOutcome 'RH8' 'CCHOST: effect damage recovered' 'OK'
Assert-GbdrAllEqualP $rh8 (Join-Path $rh8.Dir 'R.GPR') $rh8.SaveDir 'RH8 final'

# --- Fault cases --------------------------------------------------------------
function Get-GbdrUnitPathFlat([hashtable]$Case, [string]$FlatDir, [int]$UnitIndex) {
  if ($UnitIndex -eq 0) { return (Join-Path $FlatDir 'R.GPR') }
  return (Join-Path $FlatDir "CHRDATA$($Case.Slots[$UnitIndex - 1]).GAM")
}
function Get-GbdrUnitPreimage([hashtable]$Case, [int]$UnitIndex) {
  if ($UnitIndex -eq 0) { return ,$Case.Gbpr }
  return ,(New-GbdrSlotPreimage $Case.Slots[$UnitIndex - 1])
}
function Assert-GbdrRecoveredTwiceAllP([hashtable]$Case, [string]$Label) {
  Assert-GbdrAllEqualP $Case (Join-Path $gbdrRun "$($Case.Name)A\R.GPR") (Join-Path $gbdrRun "$($Case.Name)A") "$Label <C>A"
  Assert-GbdrAllEqualP $Case (Join-Path $Case.Dir 'R.GPR') $Case.SaveDir "$Label final"
}

# RK0/RK1/RK3/RK7/RKE/RT0/RT4: crash -> empty log, status CRASH at RUN1.
foreach ($n in @('RK0_RUN1', 'RK1_RUN1', 'RK3_RUN1', 'RK7_RUN1', 'RKE_RUN1', 'RT0_RUN1', 'RT4_RUN1')) {
  $r = Get-GbdrLogStatus $n
  if ($r.Log -ne '' -or $r.Status -ne 'CRASH') { throw "GBDR fault case $n expected empty log / CRASH, got log '$($r.Log)' status '$($r.Status)'" }
}
Assert-GbdrOutcome 'RK0_RUN2' 'CCHOST: effect damage recovered' 'OK'
Assert-GbdrOutcome 'RK0_RUN3' 'CCHOST: effect damage journal absent' 'OK'  # plan §22.5 J.1
Assert-GbdrRecoveredTwiceAllP $rk0 'RK0'
$rk0MDir = Join-Path $gbdrRun 'RK0M'
for ($u = 0; $u -le 6; $u++) { Test-GbdrBytesEqual (Get-GbdrUnitPathFlat $rk0 $rk0MDir $u) (New-GbdrDamagedBytes (Get-GbdrUnitPreimage $rk0 $u)) "RK0 <C>M unit $u" }

Assert-GbdrOutcome 'RK1_RUN2' 'CCHOST: effect damage recovered' 'OK'
Assert-GbdrOutcome 'RK1_RUN3' 'CCHOST: effect damage journal absent' 'OK'  # plan §22.5 J.1
Assert-GbdrRecoveredTwiceAllP $rk1 'RK1'
$rk1MDir = Join-Path $gbdrRun 'RK1M'
Test-GbdrBytesEqual (Get-GbdrUnitPathFlat $rk1 $rk1MDir 0) (Get-GbdrUnitPreimage $rk1 0) 'RK1 <C>M unit 0'
for ($u = 1; $u -le 6; $u++) { Test-GbdrBytesEqual (Get-GbdrUnitPathFlat $rk1 $rk1MDir $u) (New-GbdrDamagedBytes (Get-GbdrUnitPreimage $rk1 $u)) "RK1 <C>M unit $u" }

Assert-GbdrOutcome 'RK3_RUN2' 'CCHOST: effect damage recovered' 'OK'
Assert-GbdrOutcome 'RK3_RUN3' 'CCHOST: effect damage journal absent' 'OK'  # plan §22.5 J.1
Assert-GbdrRecoveredTwiceAllP $rk3 'RK3'
$rk3MDir = Join-Path $gbdrRun 'RK3M'
for ($u = 0; $u -le 2; $u++) { Test-GbdrBytesEqual (Get-GbdrUnitPathFlat $rk3 $rk3MDir $u) (Get-GbdrUnitPreimage $rk3 $u) "RK3 <C>M unit $u" }
for ($u = 3; $u -le 6; $u++) { Test-GbdrBytesEqual (Get-GbdrUnitPathFlat $rk3 $rk3MDir $u) (New-GbdrDamagedBytes (Get-GbdrUnitPreimage $rk3 $u)) "RK3 <C>M unit $u" }

Assert-GbdrOutcome 'RK7_RUN2' 'CCHOST: effect damage recovered' 'OK'
Assert-GbdrOutcome 'RK7_RUN3' 'CCHOST: effect damage journal absent' 'OK'  # plan §22.5 J.1
Assert-GbdrRecoveredTwiceAllP $rk7 'RK7'
$rk7MDir = Join-Path $gbdrRun 'RK7M'
for ($u = 0; $u -le 6; $u++) { Test-GbdrBytesEqual (Get-GbdrUnitPathFlat $rk7 $rk7MDir $u) (Get-GbdrUnitPreimage $rk7 $u) "RK7 <C>M unit $u" }

Assert-GbdrOutcome 'RKE_RUN2' 'CCHOST: effect damage recovered' 'OK'
Assert-GbdrOutcome 'RKE_RUN3' 'CCHOST: effect damage journal absent' 'OK'  # plan §22.5 J.1
Assert-GbdrRecoveredTwiceAllP $rke 'RKE'
$rkeMDir = Join-Path $gbdrRun 'RKEM'
for ($u = 0; $u -le 6; $u++) { Test-GbdrBytesEqual (Get-GbdrUnitPathFlat $rke $rkeMDir $u) (Get-GbdrUnitPreimage $rke $u) "RKE <C>M unit $u" }

Assert-GbdrOutcome 'RT0_RUN2' 'CCHOST: effect damage recovered' 'OK'
Assert-GbdrOutcome 'RT0_RUN3' 'CCHOST: effect damage journal absent' 'OK'  # plan §22.5 J.1
Assert-GbdrRecoveredTwiceAllP $rt0 'RT0'
$rt0MDir = Join-Path $gbdrRun 'RT0M'
$rt0RosterP = Get-GbdrUnitPreimage $rt0 0
$rt0RosterHalf = [Math]::Floor($rt0RosterP.Length / 2)
$rt0RosterD = New-GbdrDamagedBytes $rt0RosterP
Test-GbdrBytesEqual (Get-GbdrUnitPathFlat $rt0 $rt0MDir 0) (New-GbdrSplice $rt0RosterP $rt0RosterD $rt0RosterHalf) 'RT0 <C>M unit 0'
for ($u = 1; $u -le 6; $u++) { Test-GbdrBytesEqual (Get-GbdrUnitPathFlat $rt0 $rt0MDir $u) (New-GbdrDamagedBytes (Get-GbdrUnitPreimage $rt0 $u)) "RT0 <C>M unit $u" }

Assert-GbdrOutcome 'RT4_RUN2' 'CCHOST: effect damage recovered' 'OK'
Assert-GbdrOutcome 'RT4_RUN3' 'CCHOST: effect damage journal absent' 'OK'  # plan §22.5 J.1
Assert-GbdrRecoveredTwiceAllP $rt4 'RT4'
$rt4MDir = Join-Path $gbdrRun 'RT4M'
for ($u = 0; $u -le 3; $u++) { Test-GbdrBytesEqual (Get-GbdrUnitPathFlat $rt4 $rt4MDir $u) (Get-GbdrUnitPreimage $rt4 $u) "RT4 <C>M unit $u" }
$rt4U4P = Get-GbdrUnitPreimage $rt4 4
$rt4U4D = New-GbdrDamagedBytes $rt4U4P
Test-GbdrBytesEqual (Get-GbdrUnitPathFlat $rt4 $rt4MDir 4) (New-GbdrSplice $rt4U4P $rt4U4D 108) 'RT4 <C>M unit 4'
for ($u = 5; $u -le 6; $u++) { Test-GbdrBytesEqual (Get-GbdrUnitPathFlat $rt4 $rt4MDir $u) (New-GbdrDamagedBytes (Get-GbdrUnitPreimage $rt4 $u)) "RT4 <C>M unit $u" }

# RF0/RF5/RW2: BAD status, exact incomplete diagnostic at RUN1.
foreach ($n in @('RF0_RUN1', 'RF5_RUN1', 'RW2_RUN1')) {
  Assert-GbdrOutcome $n 'CCHOST: effect damage recovery incomplete' 'BAD'
}
Assert-GbdrOutcome 'RF0_RUN2' 'CCHOST: effect damage recovered' 'OK'
Assert-GbdrOutcome 'RF0_RUN3' 'CCHOST: effect damage journal absent' 'OK'  # plan §22.5 J.1
Assert-GbdrRecoveredTwiceAllP $rf0 'RF0'
$rf0MDir = Join-Path $gbdrRun 'RF0M'
for ($u = 0; $u -le 6; $u++) { Test-GbdrBytesEqual (Get-GbdrUnitPathFlat $rf0 $rf0MDir $u) (New-GbdrDamagedBytes (Get-GbdrUnitPreimage $rf0 $u)) "RF0 <C>M unit $u" }

Assert-GbdrOutcome 'RF5_RUN2' 'CCHOST: effect damage recovered' 'OK'
Assert-GbdrOutcome 'RF5_RUN3' 'CCHOST: effect damage journal absent' 'OK'  # plan §22.5 J.1
Assert-GbdrRecoveredTwiceAllP $rf5 'RF5'
$rf5MDir = Join-Path $gbdrRun 'RF5M'
for ($u = 0; $u -le 4; $u++) { Test-GbdrBytesEqual (Get-GbdrUnitPathFlat $rf5 $rf5MDir $u) (Get-GbdrUnitPreimage $rf5 $u) "RF5 <C>M unit $u" }
for ($u = 5; $u -le 6; $u++) { Test-GbdrBytesEqual (Get-GbdrUnitPathFlat $rf5 $rf5MDir $u) (New-GbdrDamagedBytes (Get-GbdrUnitPreimage $rf5 $u)) "RF5 <C>M unit $u" }

Assert-GbdrOutcome 'RW2_RUN2' 'CCHOST: effect damage recovered' 'OK'
Assert-GbdrOutcome 'RW2_RUN3' 'CCHOST: effect damage journal absent' 'OK'  # plan §22.5 J.1
Assert-GbdrRecoveredTwiceAllP $rw2 'RW2'
$rw2MDir = Join-Path $gbdrRun 'RW2M'
for ($u = 0; $u -le 1; $u++) { Test-GbdrBytesEqual (Get-GbdrUnitPathFlat $rw2 $rw2MDir $u) (Get-GbdrUnitPreimage $rw2 $u) "RW2 <C>M unit $u" }
$rw2U2P = Get-GbdrUnitPreimage $rw2 2
$rw2U2D = New-GbdrDamagedBytes $rw2U2P
Test-GbdrBytesEqual (Get-GbdrUnitPathFlat $rw2 $rw2MDir 2) (New-GbdrSplice $rw2U2P $rw2U2D 215) 'RW2 <C>M unit 2'
for ($u = 3; $u -le 6; $u++) { Test-GbdrBytesEqual (Get-GbdrUnitPathFlat $rw2 $rw2MDir $u) (New-GbdrDamagedBytes (Get-GbdrUnitPreimage $rw2 $u)) "RW2 <C>M unit $u" }

Write-Output 'GBDR restore matrix (plan step 6): all RS/RH8/RK/RT/RF/RW cases verified'


# Production replay of every reject: <name>P must log the IDENTICAL exact
# diagnostic and status the marker build produced for $name (asserted above),
# under the unmodified production build, replacing RJVPRD/PFPRD.
foreach ($name in ($gbdjRejectNames | Where-Object { $_ -ne 'PFO1' })) {
  $log = (Get-Content (Join-Path $gbdjRun "${name}P.LOG") -Raw).Trim()
  $status = (Get-Content (Join-Path $gbdjRun "${name}P.STA") -Raw).Trim()
  if ($log -like '*GBDJ reader accepted*') {
    throw "CCHOST.RJP (unmodified production) printed the test-only GBDJ acceptance marker for ${name}P"
  }
  if ($gbdjAbsentRejectNames -contains $name) {
    if ($log -ne 'CCHOST: effect damage journal absent' -or $status -ne 'OK') {  # plan §22.5 J.1
      throw "CCHOST.RJP production replay of absent-journal fixture $name did not report the exact journal-absent diagnostic (got '$log', status '$status')"
    }
    continue
  }
  if ($log -ne 'CCHOST: invalid host request (result)' -or $status -ne 'BAD') {
    throw "CCHOST.RJP production replay of $name did not fail with the exact reader diagnostic (got '$log', status '$status')"
  }
}
$pfo1pLog = (Get-Content (Join-Path $gbdjRun 'PFO1P.LOG') -Raw).Trim()
$pfo1pStatus = (Get-Content (Join-Path $gbdjRun 'PFO1P.STA') -Raw).Trim()
if ($pfo1pLog -like '*GBDJ reader accepted*') {
  throw 'CCHOST.RJP (unmodified production) printed the test-only GBDJ acceptance marker for PFO1P'
}
if ($pfo1pLog -ne 'CCHOST: invalid host request (result)' -or $pfo1pStatus -ne 'BAD') {
  throw "CCHOST.RJP production replay of PFO1 did not fail with the exact reader diagnostic (got '$pfo1pLog', status '$pfo1pStatus')"
}
foreach ($name in $gbdjPreflightRejectCases) {
  $log = (Get-Content (Join-Path $gbdjRun "${name}P.LOG") -Raw).Trim()
  $status = (Get-Content (Join-Path $gbdjRun "${name}P.STA") -Raw).Trim()
  if ($log -like '*GBDJ reader accepted*') {
    throw "CCHOST.RJP (unmodified production) printed the test-only GBDJ acceptance marker for ${name}P"
  }
  if ($log -ne 'CCHOST: effect damage recovery target unavailable' -or $status -ne 'BAD') {
    throw "CCHOST.RJP production replay of $name did not fail with the exact preflight diagnostic (got '$log', status '$status')"
  }
}

# ==============================================================================
# Direct-DAMAGE journal producer (GBDJ plan step 7a): CCHOST /D <effect>
# <roster> /J. Sub-task 7a.2 (this section) authors the NON-FAULT half only:
# DP01-DP09, DPC (positive/no-op cases), DR1-DR9, DRG (replacement-table
# cases) and DA1-DA6 (argument cases). Sub-task 7a.4 appends the fault half
# (PK1-PK7, PF1, PF2, PW1, PW2, PV, PL from plan section 14.6) into the SAME
# ordered $gbdpCases list and the same $gbdpBatch, before GBDPCHK.BAT is
# written below. Every helper and case-builder here is written so 7a.4 can
# call it unmodified for its own fault-build fixtures.
#
# This section was authored WITHOUT running DOSBox, NASM, native/build.ps1 or
# cchost-test.ps1 itself (sub-task 7a.2's own constraint, run in parallel with
# 7a.1's src-level fixes). Byte-level expectations below are derived from
# docs/engine/direct-damage-journal-v1.md's "Amended 2026-09-23 (checkpoint 5)"
# block (amendments A-H) and plan section 14.6/15.7, not from any observed
# CCHOST output.

$gbdpRun = Join-Path $build 'cchost-gbdp-test'
if (Test-Path $gbdpRun) { Remove-Item -Recurse -Force $gbdpRun }
New-Item -ItemType Directory -Force $gbdpRun | Out-Null
$gbdpRootD = Join-Path $gbdpRun 'ROOTD'
New-Item -ItemType Directory -Force $gbdpRootD | Out-Null

Copy-Item (Join-Path $build 'cchost.com') (Join-Path $gbdpRun 'CCHOST.RJP') -Force
Copy-Item (Join-Path $build 'cchost.com') (Join-Path $gbdpRun 'CCHOST.COM') -Force

# --- Path-safety guard: throws before DOSBox starts if any case's argument or
# D: mapping resolves outside $gbdpRun. ROOTD nests under $gbdpRun, so a D:
# mapping is safe by construction; this guard still checks it explicitly so a
# future change to the mount target cannot silently escape it. -------------
function ConvertTo-GbdpLocalPath([string]$Arg) {
  if ($Arg.Length -ge 2 -and $Arg.Substring(0, 2) -eq 'D:') {
    return Join-Path $gbdpRootD ($Arg.Substring(3))
  }
  return Join-Path $gbdpRun ($Arg.Substring(3))
}
function Assert-GbdpPathInside([string]$Arg, [string]$Label) {
  if ($null -eq $Arg) { return }
  # Deliberately-malformed arguments (e.g. DA5's relative roster) are not an
  # absolute drive path at all; there is nothing to translate or escape, and
  # the whole point of that case is that CCHOST rejects it before touching disk.
  if ($Arg -notmatch '^[A-Za-z]:\\') { return }
  $local = ConvertTo-GbdpLocalPath $Arg
  $full = [IO.Path]::GetFullPath($local)
  $base = [IO.Path]::GetFullPath($gbdpRun)
  $ok = $full.Equals($base, [StringComparison]::OrdinalIgnoreCase) -or
        $full.StartsWith($base + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
  if (-not $ok) { throw "GBDP path-safety guard: $Label argument '$Arg' resolves outside $gbdpRun (got '$full')" }
}
Assert-GbdpPathInside 'D:\' 'D: mount target'

$gbdpDerangement = [byte[]](3, 6, 1, 5, 2, 4)
$gbdpReadOnlyFiles = @()
$gbdpCases = @()

# --- Content-construction helpers (plan 15.7 "Content conventions") ---------
# Roster: New-GbdrRosterWithPreimages (existing GBDR helper) gives the compact
# GBPR + per-member 216-byte preimage raw area; this adds the GBD1 cache HP
# word convention this step needs on top of it.
function New-GbdpRoster([byte[]]$Slots) {
  $roster = New-GbdrRosterWithPreimages $Slots
  for ($i = 0; $i -lt $Slots.Length; $i++) {
    $off = 16 + ($i * 410)
    $hpOff = $off + 1 + 216 + 6
    # High-bit slots (>= 0x80) seed HP from their low 7 bits, per the brief, so
    # the value stays in the same small range as an ordinary slot 1..6 instead
    # of folding the presence flag into the HP number itself.
    Set-U16 $roster $hpOff (0x40 + ($Slots[$i] -band 0x7F))
  }
  return ,$roster
}
# CoK (non-compact) single-member roster, for DPC: same shape as the top-of-
# file $roster fixture (flags bit 0 clear at offset 10).
function New-GbdpCokRoster {
  $r = New-Object byte[] (16 + 410)
  [Text.Encoding]::ASCII.GetBytes('GBPR').CopyTo($r, 0)
  Set-U16 $r 4 1
  Set-U16 $r 6 1
  Set-U16 $r 8 410
  Set-U16 $r 10 0
  $r[16] = 1
  return ,$r
}
# ordinal (0-based) -> 216-byte preimage, for every LOW slot (1..6) in Slots.
# A high-bit slot has no backing source file and is omitted from the map.
function New-GbdpSourceMap([byte[]]$Slots) {
  $map = @{}
  for ($i = 0; $i -lt $Slots.Length; $i++) {
    if ($Slots[$i] -ge 1 -and $Slots[$i] -le 6) { $map[$i] = New-GbdrSlotPreimage $Slots[$i] }
  }
  return $map
}
# One damage event: AllTarget, or a 1-based Target. Value = count*sides+bonus;
# every event here uses Count=Value, Sides=1, Bonus=0 so the requested damage
# value is explicit rather than assembled from an arbitrary dice shape.
function New-GbdpDamageEvent {
  param([int]$Target = 0, [switch]$AllTarget, [Parameter(Mandatory)][int]$Value)
  return @{ Target = $Target; AllTarget = [bool]$AllTarget; Value = $Value }
}
# 20-byte GBSX record for one event, per plan 15.7's exact layout:
#   targeted:   +0 0x2E, +2 argc 7, +4 control 0x80, +6/+8/+10 count/sides/bonus,
#               +12 0x80, +14 1, +16 target (1-based)
#   all-target: +0 0x2E, +2 argc 5, +4 control 0xE0, +6/+8/+10 as above
function New-GbdpEventRecordBytes([hashtable]$Event) {
  $rec = New-Object byte[] 20
  $rec[0] = 0x2E
  if ($Event.AllTarget) {
    Set-U16 $rec 2 5
    Set-U16 $rec 4 0xE0
  } else {
    Set-U16 $rec 2 7
    Set-U16 $rec 4 0x80
  }
  Set-U16 $rec 6 $Event.Value
  Set-U16 $rec 8 1
  Set-U16 $rec 10 0
  if (-not $Event.AllTarget) {
    Set-U16 $rec 12 0x80
    Set-U16 $rec 14 1
    Set-U16 $rec 16 $Event.Target
  }
  return ,$rec
}
function New-GbdpEffectBytes {
  param([UInt16]$Version = 14, [Parameter(Mandatory)][AllowEmptyCollection()][array]$Events, [UInt16]$Flags = 0)
  $len = if ($Version -eq 14) { 5920 } else { 5750 }
  $buf = New-Object byte[] $len
  [Text.Encoding]::ASCII.GetBytes('GBEF').CopyTo($buf, 0)
  Set-U16 $buf 4 $Version
  Set-U16 $buf 6 $Flags
  [Text.Encoding]::ASCII.GetBytes('GBSX').CopyTo($buf, 2246)
  Set-U16 $buf 2250 $Events.Length
  $off = 2252
  foreach ($ev in $Events) {
    [Array]::Copy((New-GbdpEventRecordBytes $ev), 0, $buf, $off, 20)
    $off += 20
  }
  return ,$buf
}

# C1: a valid effect (real GBSX magic, one targeted DAMAGE record on member 1)
# for the zero-write and argument case builders below. Those builders used to
# write New-GbefBytes -Version 14, which has no GBSX magic at all, so a
# mutation that wrongly let apply_effect_damage_roster proceed would still
# produce zero writes and the case would pass for the wrong reason.
$gbdpValidZeroWriteEffect = New-GbdpEffectBytes -Version 14 -Events @((New-GbdpDamageEvent -Target 1 -Value 7))

# --- Independent model (never reads CCHOST output) --------------------------
# Get-GbdpModelMask: OR of every targeted ordinal's bit, under the same
# targeting rule as the write model below.
function Get-GbdpModelMask {
  param([Parameter(Mandatory)][byte[]]$Gbpr, [Parameter(Mandatory)][AllowEmptyCollection()][array]$Events)
  $count = Get-GbdjRosterCount $Gbpr
  [UInt16]$mask = 0
  foreach ($ev in $Events) {
    if ($ev.Value -le 0) { continue }
    for ($ord = 0; $ord -lt $count; $ord++) {
      $targeted = $false
      if ($ev.AllTarget) {
        $targeted = $true
      } elseif ($ev.Target -ge 1 -and $ev.Target -le $count -and $ev.Target -le 6) {
        $targeted = ($ord -eq ($ev.Target - 1))
      }
      if ($targeted) { $mask = $mask -bor (1 -shl $ord) }
    }
  }
  return $mask
}
# Get-GbdpModelPost: applies every event, in order, to a CLONE of the roster
# and source map. HP -= v, floored at 0; GBPR flags |= 2; for a low slot
# (1..6) only, that source's byte 214 = the new HP's low byte; byte 40 stays.
function Get-GbdpModelPost {
  param([Parameter(Mandatory)][byte[]]$Gbpr, [Parameter(Mandatory)][hashtable]$Sources, [Parameter(Mandatory)][AllowEmptyCollection()][array]$Events)
  $count = Get-GbdjRosterCount $Gbpr
  $postGbpr = [byte[]]$Gbpr.Clone()
  $postSources = @{}
  foreach ($k in $Sources.Keys) { $postSources[$k] = [byte[]]$Sources[$k].Clone() }
  foreach ($ev in $Events) {
    if ($ev.Value -le 0) { continue }
    for ($ord = 0; $ord -lt $count; $ord++) {
      $targeted = $false
      if ($ev.AllTarget) {
        $targeted = $true
      } elseif ($ev.Target -ge 1 -and $ev.Target -le $count -and $ev.Target -le 6) {
        $targeted = ($ord -eq ($ev.Target - 1))
      }
      if (-not $targeted) { continue }
      $off = 16 + ($ord * 410)
      $hpOff = $off + 1 + 216 + 6
      $flagsOff = $off + 1 + 216 + 4
      $hp = [BitConverter]::ToUInt16($postGbpr, $hpOff)
      $newHp = [Math]::Max(0, $hp - $ev.Value)
      Set-U16 $postGbpr $hpOff $newHp
      $flags = [BitConverter]::ToUInt16($postGbpr, $flagsOff)
      Set-U16 $postGbpr $flagsOff ($flags -bor 2)
      $slot = $postGbpr[$off]
      if ($slot -ge 1 -and $slot -le 6 -and $postSources.ContainsKey($ord)) {
        $lo = [byte]($newHp -band 0xFF)
        $postSources[$ord][214] = $lo
      }
    }
  }
  return @{ Gbpr = $postGbpr; Sources = $postSources }
}
function Assert-GbdpBytesEqual([byte[]]$Actual, [byte[]]$Expected, [string]$Label) {
  if ($Actual.Length -ne $Expected.Length) {
    throw "$Label length mismatch: expected $($Expected.Length), got $($Actual.Length)"
  }
  for ($i = 0; $i -lt $Actual.Length; $i++) {
    if ($Actual[$i] -ne $Expected[$i]) {
      throw ("{0} differs at offset {1}: expected 0x{2:X2}, got 0x{3:X2}" -f $Label, $i, $Expected[$i], $Actual[$i])
    }
  }
}
# Expected journal for a produced (state=1, COMMITTED) case: New-DamageJournal
# with the model mask/sources, keyed off the case's own C:\<Name> (or D:\)
# base path. Per-ordinal source entries follow amendment F/plan 15.7 exactly:
# present only when targeted (mask bit set), within roster count, AND the
# slot is a low slot (1..6) -- a high-bit slot is targeted for GBPR purposes
# but never gets a source entry.
function New-GbdpExpectedJournal {
  param(
    [Parameter(Mandatory)][string]$BasePath,
    [Parameter(Mandatory)][byte[]]$Gbpr,
    [Parameter(Mandatory)][hashtable]$SourceP,
    [Parameter(Mandatory)][UInt64]$Generation,
    [Parameter(Mandatory)][UInt16]$Mask,
    [Parameter(Mandatory)][UInt32]$EffectExtent,
    [UInt32]$GbslExtent = 0,
    [Parameter(Mandatory)][byte[]]$EffectBytes,
    [byte[]]$GbslBytes = $null,
    # 7b (DR12): the retained effect/token FILE NAMES. Defaulted to the
    # request's own "E.EFX"/"E.DOP" so every 7a caller is unaffected; DR12
    # passes "F.EFX"/"F.DOP" to build a journal for a DIFFERENT identity
    # than the case's live request, while still using this case's own real
    # preimages (SourceP) -- unlike New-GbdpForeignJournal, whose sources
    # are not the case's.
    [string]$EffectName = 'E.EFX',
    [string]$TokenName = 'E.DOP'
  )
  $count = Get-GbdjRosterCount $Gbpr
  $sources = @()
  for ($k = 0; $k -lt 6; $k++) {
    $bitSet = ($Mask -band (1 -shl $k)) -ne 0
    $slot = if ($k -lt $count) { Get-GbdjRosterSlot $Gbpr $k } else { 0 }
    if ($k -lt $count -and $bitSet -and $slot -ge 1 -and $slot -le 6) {
      $sources += ,(New-GbdjSourceEntry 1 $slot $SourceP[$k])
    } else {
      $sources += ,(New-GbdjSourceEntry 0 0 $null)
    }
  }
  $params = @{
    RosterPath = "$BasePath\R.GPR"; TokenPath = "$BasePath\$TokenName"
    EffectPath = "$BasePath\$EffectName"; SourceDirPath = "$BasePath\SAVE"
    Gbpr = $Gbpr; Generation = $Generation; State = 1; Mask = $Mask
    EffectExtent = $EffectExtent; EffectBytes = $EffectBytes; Sources = $sources
  }
  if ($GbslExtent -gt 0) { $params['GbslExtent'] = $GbslExtent; $params['GbslBytes'] = $GbslBytes }
  return New-DamageJournal @params
}
# A deliberately "foreign" pre-existing journal for the DR replacement-table
# cases: full manual control of every header field, independent of the live
# request's own paths, built via New-GbdjDefaultSources for internal
# self-consistency (so it can pass the "all states" structural checks that
# run before the amendment C generation/identity decision).
# --- Pure helper 1: -State wrapper around New-GbdpExpectedJournal -------------
# New-GbdpExpectedJournal (7a.2, non-fault half) hard-codes State = 1
# (COMMITTED) because every non-fault positive case ends committed. The fault
# half also needs the PREPARED (state 0) shape of the identical journal (the
# in-memory image amendment D.5 builds BEFORE the commit step, D.7, flips the
# state word). Per plan 14.6: "Add a -State parameter in your fragment as a
# wrapper function; do not edit the original." The producer's commit step
# writes only the state word's low byte (offset 6) from 0 to 1 ("exactly one
# byte changes" -- amendment D.7), so the PREPARED bytes are the COMMITTED
# bytes with that one byte patched back, rather than a second, independently
# re-derived layout that could drift from the original's.
function New-GbdpExpectedJournalState {
  param(
    [Parameter(Mandatory)][string]$BasePath,
    [Parameter(Mandatory)][byte[]]$Gbpr,
    [Parameter(Mandatory)][hashtable]$SourceP,
    [Parameter(Mandatory)][UInt64]$Generation,
    [Parameter(Mandatory)][UInt16]$Mask,
    [Parameter(Mandatory)][UInt32]$EffectExtent,
    [UInt32]$GbslExtent = 0,
    [Parameter(Mandatory)][byte[]]$EffectBytes,
    [byte[]]$GbslBytes = $null,
    [UInt16]$State = 1,
    # 7b (DR6/DR12): forwarded to New-GbdpExpectedJournal unchanged; default
    # keeps every 7a caller identical.
    [string]$EffectName = 'E.EFX',
    [string]$TokenName = 'E.DOP'
  )
  $committed = New-GbdpExpectedJournal -BasePath $BasePath -Gbpr $Gbpr -SourceP $SourceP `
    -Generation $Generation -Mask $Mask -EffectExtent $EffectExtent -GbslExtent $GbslExtent `
    -EffectBytes $EffectBytes -GbslBytes $GbslBytes -EffectName $EffectName -TokenName $TokenName
  if ($State -eq 1) { return ,$committed }
  $patched = [byte[]]$committed.Clone()
  $patched[6] = [byte]$State
  $patched[7] = 0
  return ,$patched
}

function New-GbdpForeignJournal {
  param(
    [UInt16]$State = 1,
    [UInt64]$Generation = 1,
    [Parameter(Mandatory)][string]$EffectPath,
    [Parameter(Mandatory)][string]$TokenPath,
    [Parameter(Mandatory)][string]$RosterPath,
    [Parameter(Mandatory)][string]$SourceDirPath,
    [Parameter(Mandatory)][byte[]]$Gbpr,
    [UInt16]$Mask = 1,
    [UInt32]$EffectExtent = 5920,
    [switch]$BadMagic,
    # C1: optional retained-effect override. Defaults to the pre-existing
    # New-GbefBytes behaviour (a structurally-valid-length but content-
    # arbitrary effect). DR6/DR7 ("same effect") pass the case's own E.EFX
    # bytes here, so the journal's retained effect matches the file on disk,
    # which 7b's DR6 (a real /R validate-only replay) relies on.
    [byte[]]$EffectBytes = $null
  )
  $effectBytes = if ($null -ne $EffectBytes) { $EffectBytes } else { New-GbefBytes -Version 14 -Extent $EffectExtent }
  $sources = New-GbdjDefaultSources $Gbpr $Mask
  $journal = New-DamageJournal -RosterPath $RosterPath -SourceDirPath $SourceDirPath -TokenPath $TokenPath `
    -EffectPath $EffectPath -Generation $Generation -State $State -Mask $Mask `
    -EffectExtent $EffectExtent -EffectBytes $effectBytes -Gbpr $Gbpr -Sources $sources
  if ($BadMagic) { $journal[0] = $journal[0] -bxor 0xFF }
  return ,$journal
}

# --- Batch line builder (step 6's OK/BAD/CRASH/OTHER ladder, wrapped in the
# cd \<C> / ... / cd \ sequence plan 15.7 specifies) -------------------------
function New-GbdpCommandLines([string]$Name, [string]$CdTarget, [string]$Command) {
  $lines = New-Object System.Collections.Generic.List[string]
  if ($CdTarget) { $lines.Add("cd \$CdTarget") }
  $lines.Add("$Command > C:\$Name.LOG")
  $lines.Add("if errorlevel 8 goto ${Name}_x")
  $lines.Add("if errorlevel 7 goto ${Name}_crash")
  $lines.Add("if errorlevel 1 goto ${Name}_bad")
  $lines.Add("echo OK>C:\$Name.STA")
  $lines.Add("goto ${Name}_done")
  $lines.Add(":${Name}_x")
  $lines.Add("echo OTHER>C:\$Name.STA")
  $lines.Add("goto ${Name}_done")
  $lines.Add(":${Name}_crash")
  $lines.Add("echo CRASH>C:\$Name.STA")
  $lines.Add("goto ${Name}_done")
  $lines.Add(":${Name}_bad")
  $lines.Add("echo BAD>C:\$Name.STA")
  $lines.Add(":${Name}_done")
  if ($CdTarget) { $lines.Add("cd \") }
  return ,$lines.ToArray()
}

# --- Snapshot/assertion plumbing shared by every case's Expect scriptblock,
# populated once the run completes (see "Run" below). $gbdpBefore/$gbdpAfter
# are script-scope and read directly by the functions below; each case's
# Expect scriptblock receives its case explicitly and resolves helpers in this
# script scope, including the snapshots populated after the run. GetNewClosure
# creates a separate module that cannot resolve these script-local helpers. ---------------------------------------
function Assert-GbdpFileUnchanged([string]$RelPath, [string]$Label) {
  $b = $gbdpBefore.Files | Where-Object { $_.Path -eq $RelPath } | Select-Object -First 1
  $a = $gbdpAfter.Files | Where-Object { $_.Path -eq $RelPath } | Select-Object -First 1
  if ($null -eq $b -or $null -eq $a) { throw "$Label ($RelPath) missing from a snapshot" }
  if ($b.Size -ne $a.Size -or $b.LastWriteTimeUtc -ne $a.LastWriteTimeUtc -or $b.Hash -ne $a.Hash) {
    throw "$Label ($RelPath) changed between snapshots"
  }
}
# C2: directory mtimes. Get-GbdpSnapshot already records $Dirs, but nothing
# read it before this fix -- a create-then-delete inside a refusal case's
# directory (e.g. a stray .GDN written and then removed) is invisible to a
# content-only file oracle and would previously have passed silently.
function Assert-GbdpDirUnchanged([string]$Dir, [string]$Label) {
  $relDir = $Dir.Substring($gbdpRun.Length)
  $b = $gbdpBefore.Dirs | Where-Object { $_.Path -eq $relDir } | Select-Object -First 1
  $a = $gbdpAfter.Dirs | Where-Object { $_.Path -eq $relDir } | Select-Object -First 1
  if ($null -eq $b -or $null -eq $a) { throw "$Label ($relDir) missing from a directory snapshot" }
  if ($b.LastWriteTimeUtc -ne $a.LastWriteTimeUtc) { throw "$Label ($relDir) mtime changed between snapshots" }
}
function Assert-GbdpCaseSnapshotIdentical([hashtable]$Case) {
  $relDir = $Case.Dir.Substring($gbdpRun.Length)
  # Fixture-build fix: a bare StartsWith($relDir) has no boundary check, so a
  # case whose name is a string-prefix of another (e.g. DPC / DPCL) picks up
  # the OTHER case's files too ("\DPCL\R.GPR".StartsWith("\DPC") is true).
  # Require the directory-separator boundary explicitly.
  $relDirPrefix = $relDir + [IO.Path]::DirectorySeparatorChar
  $beforeFiles = @($gbdpBefore.Files | Where-Object { $_.Path.StartsWith($relDirPrefix, [StringComparison]::OrdinalIgnoreCase) })
  $afterMap = @{}
  foreach ($f in ($gbdpAfter.Files | Where-Object { $_.Path.StartsWith($relDirPrefix, [StringComparison]::OrdinalIgnoreCase) })) { $afterMap[$f.Path] = $f }
  foreach ($bf in $beforeFiles) {
    $af = $afterMap[$bf.Path]
    if ($null -eq $af) { throw "$($Case.Name): $($bf.Path) disappeared between snapshots" }
    if ($af.Size -ne $bf.Size -or $af.LastWriteTimeUtc -ne $bf.LastWriteTimeUtc -or $af.Hash -ne $bf.Hash) {
      throw "$($Case.Name): $($bf.Path) changed between snapshots"
    }
  }
  if ($afterMap.Count -ne $beforeFiles.Count) { throw "$($Case.Name): file count under $relDir changed between snapshots" }
  # C2: also require the case directory's and its SAVE directory's mtime to be
  # unchanged. DR9 is exempt by construction: it has a nonzero mask, so its
  # Invoke-GbdpDamageExpect path never calls this function at all.
  Assert-GbdpDirUnchanged $Case.Dir "$($Case.Name) case directory"
  if ($Case.ContainsKey('SaveDir')) { Assert-GbdpDirUnchanged $Case.SaveDir "$($Case.Name) SAVE directory" }
}
function Invoke-GbdpZeroWriteExpect([hashtable]$Case) {
  $log = (Get-Content (Join-Path $gbdpRun "$($Case.Name).LOG") -Raw).Trim()
  $status = (Get-Content (Join-Path $gbdpRun "$($Case.Name).STA") -Raw).Trim()
  if ($log -ne $Case.ExpectedLog -or $status -ne $Case.ExpectedStatus) {
    throw "$($Case.Name): expected log '$($Case.ExpectedLog)' status '$($Case.ExpectedStatus)', got log '$log' status '$status'"
  }
  Assert-GbdpCaseSnapshotIdentical $Case
}
function Invoke-GbdpDamageExpect([hashtable]$Case) {
  $log = (Get-Content (Join-Path $gbdpRun "$($Case.Name).LOG") -Raw).Trim()
  $status = (Get-Content (Join-Path $gbdpRun "$($Case.Name).STA") -Raw).Trim()
  if ($log -ne $Case.ExpectedLog -or $status -ne $Case.ExpectedStatus) {
    throw "$($Case.Name): expected log '$($Case.ExpectedLog)' status '$($Case.ExpectedStatus)', got log '$log' status '$status'"
  }
  $relDir = $Case.Dir.Substring($gbdpRun.Length)
  Assert-GbdpFileUnchanged "$relDir\E.EFX" "$($Case.Name) effect"
  Assert-GbdpFileUnchanged "$relDir\E.DOP" "$($Case.Name) token"
  $relGbs = "$relDir\E.GBS"
  if ($gbdpBefore.Files | Where-Object { $_.Path -eq $relGbs }) {
    Assert-GbdpFileUnchanged $relGbs "$($Case.Name) GBSL sidecar"
  }

  $journalPath = Join-Path $Case.Dir 'R.GDJ'
  if ($Case.Mask -eq 0) {
    if (Test-Path $journalPath) { throw "$($Case.Name): R.GDJ unexpectedly present for a zero-mask event" }
    Assert-GbdpCaseSnapshotIdentical $Case
    return
  }
  if (-not (Test-Path $journalPath)) { throw "$($Case.Name): R.GDJ missing" }
  if ($Case.ContainsKey('AssertJournalMinLength')) {
    $len = (Get-Item $journalPath).Length
    if ($len -le $Case.AssertJournalMinLength) { throw "$($Case.Name): expected R.GDJ over $($Case.AssertJournalMinLength) bytes, got $len" }
  }
  Assert-GbdpBytesEqual ([IO.File]::ReadAllBytes($journalPath)) $Case.ExpectedJournalBytes "$($Case.Name) R.GDJ"
  Assert-GbdpBytesEqual ([IO.File]::ReadAllBytes((Join-Path $Case.Dir 'R.GPR'))) $Case.Model.Gbpr "$($Case.Name) R.GPR"
  foreach ($ord in $Case.Model.Sources.Keys) {
    $slot = $Case.Slots[$ord]
    $srcPath = Join-Path $Case.SaveDir "CHRDATA$slot.GAM"
    Assert-GbdpBytesEqual ([IO.File]::ReadAllBytes($srcPath)) $Case.Model.Sources[$ord] "$($Case.Name) CHRDATA$slot.GAM"
  }
  foreach ($fname in $Case.ForeignFiles.Keys) {
    Assert-GbdpBytesEqual ([IO.File]::ReadAllBytes((Join-Path $Case.SaveDir $fname))) $Case.ForeignFiles[$fname] "$($Case.Name) foreign file $fname"
    # C3: byte-identical is not enough (plan 14.6 says byte- AND mtime-
    # identical) -- a rewrite-with-the-same-bytes is invisible to the content
    # check above but would still move the mtime, so check the snapshot too.
    Assert-GbdpFileUnchanged "$relDir\SAVE\$fname" "$($Case.Name) foreign file $fname (mtime)"
  }
}

# --- Case builders ------------------------------------------------------------
# Positive/no-op cases (DP01-DP09), and the replacement-table "applied" rows
# (DR2/DR4/DR9), which are the same shape plus a pre-existing journal/.GDN
# that must be correctly bypassed or deleted first.
function New-GbdpDamageCase {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][byte[]]$Slots,
    [Parameter(Mandatory)][AllowEmptyCollection()][array]$Events,
    [UInt16]$Version = 14,
    [UInt32]$GbslExtent = 0,
    [UInt64]$Generation = 1,
    [hashtable]$ForeignFiles = @{},
    [byte[]]$PreexistingJournalBytes = $null,
    [byte[]]$PreexistingGdnBytes = $null,
    [byte[]]$EffectBytesOverride = $null
  )
  $dir = Join-Path $gbdpRun $Name
  $saveDir = Join-Path $dir 'SAVE'
  New-Item -ItemType Directory -Force $dir | Out-Null
  New-Item -ItemType Directory -Force $saveDir | Out-Null

  $rosterArg = "C:\$Name\R.GPR"; $saveArg = "C:\$Name\SAVE"
  $tokenArg = "C:\$Name\E.DOP"; $effectArg = "C:\$Name\E.EFX"
  Assert-GbdpPathInside $rosterArg "$Name roster"
  Assert-GbdpPathInside $saveArg "$Name save dir"
  Assert-GbdpPathInside $tokenArg "$Name token"
  Assert-GbdpPathInside $effectArg "$Name effect"

  $gbpr = New-GbdpRoster $Slots
  $sourceP = New-GbdpSourceMap $Slots
  [IO.File]::WriteAllBytes((Join-Path $dir 'R.GPR'), $gbpr)
  foreach ($ord in $sourceP.Keys) {
    [IO.File]::WriteAllBytes((Join-Path $saveDir "CHRDATA$($Slots[$ord]).GAM"), $sourceP[$ord])
  }
  foreach ($fname in $ForeignFiles.Keys) {
    [IO.File]::WriteAllBytes((Join-Path $saveDir $fname), $ForeignFiles[$fname])
  }
  [IO.File]::WriteAllBytes((Join-Path $dir 'E.DOP'), (New-OperationToken $Generation))

  $sideFlag = if ($GbslExtent -gt 0) { 0x0100 } else { 0 }
  $effectBytes = if ($null -ne $EffectBytesOverride) { $EffectBytesOverride } else { New-GbdpEffectBytes -Version $Version -Events $Events -Flags $sideFlag }
  [IO.File]::WriteAllBytes((Join-Path $dir 'E.EFX'), $effectBytes)
  $gbslBytes = $null
  if ($GbslExtent -gt 0) {
    $gbslBytes = New-GbslBytes -Count ([Math]::Floor(($GbslExtent - 8) / 54)) -Extent $GbslExtent
    [Array]::Copy((New-GbdpEventRecordBytes $Events[0]), 0, $gbslBytes, 8, 20)
    [IO.File]::WriteAllBytes((Join-Path $dir 'E.GBS'), $gbslBytes)
  }

  if ($null -ne $PreexistingJournalBytes) { [IO.File]::WriteAllBytes((Join-Path $dir 'R.GDJ'), $PreexistingJournalBytes) }
  if ($null -ne $PreexistingGdnBytes) { [IO.File]::WriteAllBytes((Join-Path $dir 'R.GDN'), $PreexistingGdnBytes) }

  $effectExtent = if ($Version -eq 14) { 5920 } else { 5750 }
  $mask = Get-GbdpModelMask -Gbpr $gbpr -Events $Events
  $model = Get-GbdpModelPost -Gbpr $gbpr -Sources $sourceP -Events $Events

  $case = @{
    Name = $Name; Dir = $dir; SaveDir = $saveDir
    RosterArg = $rosterArg; SaveArg = $saveArg; TokenArg = $tokenArg; EffectArg = $effectArg
    Gbpr = $gbpr; SourceP = $sourceP; Slots = $Slots; Generation = $Generation
    Mask = $mask; Model = $model; ForeignFiles = $ForeignFiles
    ExpectedLog = 'CCHOST: effect damage applied'; ExpectedStatus = 'OK'
  }
  if ($mask -ne 0) {
    $case['ExpectedJournalBytes'] = New-GbdpExpectedJournal -BasePath "C:\$Name" -Gbpr $gbpr -SourceP $sourceP `
      -Generation $Generation -Mask $mask -EffectExtent $effectExtent -GbslExtent $GbslExtent `
      -EffectBytes $effectBytes -GbslBytes $gbslBytes
  }
  $case['Commands'] = New-GbdpCommandLines -Name $Name -CdTarget $Name -Command "C:\CCHOST.COM /D $effectArg $rosterArg /J"
  $case['Setup'] = "Slots=[$($Slots -join ',')] Events=$($Events.Count) Gen=$Generation GbslExtent=$GbslExtent Preexisting=$([bool]$PreexistingJournalBytes)/$([bool]$PreexistingGdnBytes)"
  $case['Expect'] = { param($case) Invoke-GbdpDamageExpect $case }
  $script:gbdpCases += ,$case
  return $case
}

# Replacement-table rejection rows (DR1/DR3/DR5-DR8/DRG) and DPC/DA-series all
# share this "nothing must change" shape: the case just needs a valid launch
# scaffold plus a deliberate mismatch, and the whole case directory must be
# snapshot-identical afterward.
function New-GbdpZeroWriteCase {
  param(
    [Parameter(Mandatory)][string]$Name,
    [byte[]]$Slots = ([byte[]](3)),
    [Parameter(Mandatory)][string]$ExpectedLog,
    [string]$ExpectedStatus = 'BAD',
    [UInt64]$Generation = 1,
    [byte[]]$PreexistingJournalBytes = $null,
    [byte[]]$PreexistingGdnBytes = $null,
    [switch]$PreexistingGdnReadOnly,
    # C1: a valid effect by default (real GBSX magic, one live DAMAGE record),
    # so a wrongful proceed is a visible write rather than a silent no-op.
    # DR6/DR7 pass their journal's own retained effect bytes here so the
    # journal's +32 file matches the journal's retained-effect field.
    [byte[]]$EffectBytes = $gbdpValidZeroWriteEffect
  )
  $dir = Join-Path $gbdpRun $Name
  $saveDir = Join-Path $dir 'SAVE'
  New-Item -ItemType Directory -Force $dir | Out-Null
  New-Item -ItemType Directory -Force $saveDir | Out-Null
  $rosterArg = "C:\$Name\R.GPR"; $saveArg = "C:\$Name\SAVE"
  $tokenArg = "C:\$Name\E.DOP"; $effectArg = "C:\$Name\E.EFX"
  Assert-GbdpPathInside $rosterArg "$Name roster"; Assert-GbdpPathInside $saveArg "$Name save dir"
  Assert-GbdpPathInside $tokenArg "$Name token"; Assert-GbdpPathInside $effectArg "$Name effect"

  $gbpr = New-GbdpRoster $Slots
  [IO.File]::WriteAllBytes((Join-Path $dir 'R.GPR'), $gbpr)
  [IO.File]::WriteAllBytes((Join-Path $dir 'E.DOP'), (New-OperationToken $Generation))
  [IO.File]::WriteAllBytes((Join-Path $dir 'E.EFX'), $EffectBytes)
  foreach ($slot in $Slots) {
    if ($slot -ge 1 -and $slot -le 6) {
      [IO.File]::WriteAllBytes((Join-Path $saveDir "CHRDATA$slot.GAM"), (New-GbdrSlotPreimage $slot))
    }
  }
  if ($null -ne $PreexistingJournalBytes) { [IO.File]::WriteAllBytes((Join-Path $dir 'R.GDJ'), $PreexistingJournalBytes) }
  if ($null -ne $PreexistingGdnBytes) {
    $gdnPath = Join-Path $dir 'R.GDN'
    [IO.File]::WriteAllBytes($gdnPath, $PreexistingGdnBytes)
    if ($PreexistingGdnReadOnly) {
      Set-ItemProperty -Path $gdnPath -Name IsReadOnly -Value $true
      $script:gbdpReadOnlyFiles += $gdnPath
    }
  }

  $case = @{
    Name = $Name; Dir = $dir; SaveDir = $saveDir
    RosterArg = $rosterArg; SaveArg = $saveArg; TokenArg = $tokenArg; EffectArg = $effectArg
    ExpectedLog = $ExpectedLog; ExpectedStatus = $ExpectedStatus
    Commands = (New-GbdpCommandLines -Name $Name -CdTarget $Name -Command "C:\CCHOST.COM /D $effectArg $rosterArg /J")
    Setup = "zero-write case, PreexistingJournal=$([bool]$PreexistingJournalBytes), PreexistingGdn=$([bool]$PreexistingGdnBytes)"
  }
  $case['Expect'] = { param($case) Invoke-GbdpZeroWriteExpect $case }
  $script:gbdpCases += ,$case
  return $case
}

# 7b (DR12): a zero-write refusal followed by a real production recovery, in
# the SAME case, both against the case's own already-built directory. Unlike
# New-GbdpZeroWriteCase, this never uses the whole-session $gbdpBefore/
# $gbdpAfter snapshot for its zero-write proof -- the second command DOES
# write, so that global compare cannot be reused here. Instead the FIRST
# command's zero-write claim is scoped by a host-side <C>M snapshot copy
# taken immediately after it (the same flat convention New-GbdpFaultRow
# uses), and the row's caller supplies the fixture (dir/saveDir/journal/
# effect files) itself before calling this, exactly as the fault-half rows
# build their own fixture before calling New-GbdpFaultRow.
function New-GbdpZeroWriteThenRecoverRow {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][string]$Dir,
    [Parameter(Mandatory)][string]$SaveDir,
    [Parameter(Mandatory)][byte[]]$Slots,
    [Parameter(Mandatory)][string]$Command1,
    [Parameter(Mandatory)][string]$ExpectedLog1,
    [string]$ExpectedStatus1 = 'BAD',
    [Parameter(Mandatory)][scriptblock]$MExpect,
    [Parameter(Mandatory)][string]$Command2,
    [Parameter(Mandatory)][string]$ExpectedLog2,
    [string]$ExpectedStatus2 = 'OK',
    [Parameter(Mandatory)][scriptblock]$FinalExpect
  )
  $mDir = Join-Path $gbdpRun "${Name}M"
  New-Item -ItemType Directory -Force $mDir | Out-Null

  $lines = New-Object System.Collections.Generic.List[string]
  $lines.AddRange((New-GbdpCommandLines -Name "${Name}_F" -CdTarget $Name -Command $Command1))
  [void]$lines.Add("copy C:\$Name\R.GPR C:\${Name}M > nul")
  [void]$lines.Add("if exist C:\$Name\R.GDJ copy C:\$Name\R.GDJ C:\${Name}M > nul")
  [void]$lines.Add("if exist C:\$Name\R.GDN copy C:\$Name\R.GDN C:\${Name}M > nul")
  [void]$lines.Add("copy C:\$Name\SAVE\*.* C:\${Name}M > nul")
  $lines.AddRange((New-GbdpCommandLines -Name "${Name}_R1" -CdTarget $Name -Command $Command2))

  $case = @{
    Name = $Name; Dir = $Dir; SaveDir = $SaveDir; MDir = $mDir
    Fixture = @{ Slots = $Slots }
    Commands = $lines.ToArray()
    Setup = "zero-write refusal then production recovery: $Command1 / $Command2"
  }
  $case['ExpectedLog1'] = $ExpectedLog1
  $case['ExpectedStatus1'] = $ExpectedStatus1
  $case['ExpectedLog2'] = $ExpectedLog2
  $case['ExpectedStatus2'] = $ExpectedStatus2
  $case['MExpect'] = $MExpect
  $case['FinalExpect'] = $FinalExpect
  $case['Expect'] = {
    param($case)
    Assert-GbdpFaultStepOutcome "$($case.Name)_F" $case.ExpectedLog1 $case.ExpectedStatus1
    & $case.MExpect $case
    Assert-GbdpFaultStepOutcome "$($case.Name)_R1" $case.ExpectedLog2 $case.ExpectedStatus2
    & $case.FinalExpect $case
  }

  $script:gbdpCases += ,$case
  return $case
}

# Argument cases (DA1-DA6): a valid launch scaffold, but a bad command line.
function New-GbdpArgCase {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][string]$Command,
    [string]$EffectDirOverride = $null,
    # C1: a valid effect by default, same reasoning as New-GbdpZeroWriteCase.
    [byte[]]$EffectBytes = $gbdpValidZeroWriteEffect
  )
  $dir = Join-Path $gbdpRun $Name
  $saveDir = Join-Path $dir 'SAVE'
  New-Item -ItemType Directory -Force $dir | Out-Null
  New-Item -ItemType Directory -Force $saveDir | Out-Null
  $rosterArg = "C:\$Name\R.GPR"; $saveArg = "C:\$Name\SAVE"; $tokenArg = "C:\$Name\E.DOP"
  Assert-GbdpPathInside $rosterArg "$Name roster"; Assert-GbdpPathInside $saveArg "$Name save dir"; Assert-GbdpPathInside $tokenArg "$Name token"

  $gbpr = New-GbdpRoster ([byte[]](3))
  [IO.File]::WriteAllBytes((Join-Path $dir 'R.GPR'), $gbpr)
  [IO.File]::WriteAllBytes((Join-Path $dir 'E.DOP'), (New-OperationToken 1))
  [IO.File]::WriteAllBytes((Join-Path $saveDir 'CHRDATA3.GAM'), (New-GbdrSlotPreimage 3))
  if ($EffectDirOverride) {
    $effDir = Join-Path $gbdpRun $EffectDirOverride
    New-Item -ItemType Directory -Force $effDir | Out-Null
    Assert-GbdpPathInside "C:\$EffectDirOverride\EFFECT" "$Name effect (override dir)"
    [IO.File]::WriteAllBytes((Join-Path $effDir 'EFFECT'), $EffectBytes)
  } else {
    Assert-GbdpPathInside "C:\$Name\E.EFX" "$Name effect"
    [IO.File]::WriteAllBytes((Join-Path $dir 'E.EFX'), $EffectBytes)
  }

  $case = @{
    Name = $Name; Dir = $dir; SaveDir = $saveDir
    ExpectedLog = 'CCHOST: invalid host request (arguments)'; ExpectedStatus = 'BAD'
    Commands = (New-GbdpCommandLines -Name $Name -CdTarget $Name -Command $Command)
    Setup = "argument case: $Command"
  }
  $case['Expect'] = { param($case) Invoke-GbdpZeroWriteExpect $case }
  $script:gbdpCases += ,$case
  return $case
}

# DPC/DPCL (C4): built from the SAME proven legacy fixture already used by the
# plain "/D DMR.EFX DMR.GPR" legacy case near the top of this file --
# [byte[]]$roster.Clone() (CoK, flags bit 0 clear, raw +407 = 20) and
# [byte[]]$damageResume.Clone() (v14, all-target DAMAGE, value 3). Using the
# exact fixture that is independently PROVEN to apply cleanly under the
# legacy path (that case asserts DMR.GPR[424] becomes 17) makes DPC's
# "(result)" attributable to the /J refusal alone, not to some other defect
# in a from-scratch CoK roster/effect pairing. DPCL is the control: same
# fixture, same command, /J dropped -- must still apply through the legacy
# (unjournaled) path per amendment scope G8 ("CoK direct DAMAGE is never
# journaled"). DPCL asserts log/status and effect/token invariance only: it
# deliberately does not model the CoK write itself (that is proven elsewhere,
# by the DMR case), so it needs no independent post-image model here.
function New-GbdpDpcFixtureDir([string]$Name) {
  $dir = Join-Path $gbdpRun $Name
  $saveDir = Join-Path $dir 'SAVE'
  New-Item -ItemType Directory -Force $dir | Out-Null
  New-Item -ItemType Directory -Force $saveDir | Out-Null
  $rosterArg = "C:\$Name\R.GPR"; $saveArg = "C:\$Name\SAVE"
  $tokenArg = "C:\$Name\E.DOP"; $effectArg = "C:\$Name\E.EFX"
  Assert-GbdpPathInside $rosterArg "$Name roster"; Assert-GbdpPathInside $saveArg "$Name save dir"
  Assert-GbdpPathInside $tokenArg "$Name token"; Assert-GbdpPathInside $effectArg "$Name effect"

  $gbpr = [byte[]]$roster.Clone()
  $effectBytes = [byte[]]$damageResume.Clone()
  [IO.File]::WriteAllBytes((Join-Path $dir 'R.GPR'), $gbpr)
  [IO.File]::WriteAllBytes((Join-Path $dir 'E.DOP'), (New-OperationToken 1))
  [IO.File]::WriteAllBytes((Join-Path $dir 'E.EFX'), $effectBytes)

  return @{
    Name = $Name; Dir = $dir; SaveDir = $saveDir
    RosterArg = $rosterArg; SaveArg = $saveArg; TokenArg = $tokenArg; EffectArg = $effectArg
    Gbpr = $gbpr; EffectBytes = $effectBytes
  }
}

# DPC: CoK (non-compact) roster -- must reject with the reader/preflight-shaped
# "(result)" diagnostic, never "(arguments)" (D2's fix moves the non-compact
# check after the mask filter, but it is still a "(result)"-class rejection).
function New-GbdpDpcCase {
  $f = New-GbdpDpcFixtureDir 'DPC'
  $case = @{
    Name = $f.Name; Dir = $f.Dir; SaveDir = $f.SaveDir
    ExpectedLog = 'CCHOST: invalid host request (result)'; ExpectedStatus = 'BAD'
    Commands = (New-GbdpCommandLines -Name $f.Name -CdTarget $f.Name -Command "C:\CCHOST.COM /D $($f.EffectArg) $($f.RosterArg) /J")
    Setup = 'CoK (non-compact, flags bit 0 clear) roster, the proven legacy $roster/$damageResume fixture; must be rejected as (result) under /J, never written (C4)'
  }
  $case['Expect'] = { param($case) Invoke-GbdpZeroWriteExpect $case }
  $script:gbdpCases += ,$case
  return $case
}

function Invoke-GbdpDpclExpect([hashtable]$Case) {
  $log = (Get-Content (Join-Path $gbdpRun "$($Case.Name).LOG") -Raw).Trim()
  $status = (Get-Content (Join-Path $gbdpRun "$($Case.Name).STA") -Raw).Trim()
  if ($log -ne $Case.ExpectedLog -or $status -ne $Case.ExpectedStatus) {
    throw "$($Case.Name): expected log '$($Case.ExpectedLog)' status '$($Case.ExpectedStatus)', got log '$log' status '$status'"
  }
  $relDir = $Case.Dir.Substring($gbdpRun.Length)
  Assert-GbdpFileUnchanged "$relDir\E.EFX" "$($Case.Name) effect"
  Assert-GbdpFileUnchanged "$relDir\E.DOP" "$($Case.Name) token"
}

# DPCL: the DPC control (C4) -- identical fixture, /J dropped.
function New-GbdpDpclCase {
  $f = New-GbdpDpcFixtureDir 'DPCL'
  $case = @{
    Name = $f.Name; Dir = $f.Dir; SaveDir = $f.SaveDir
    ExpectedLog = 'CCHOST: effect damage applied'; ExpectedStatus = 'OK'
    Commands = (New-GbdpCommandLines -Name $f.Name -CdTarget $f.Name -Command "C:\CCHOST.COM /D $($f.EffectArg) $($f.RosterArg)")
    Setup = 'DPC control (C4): identical fixture, no /J -- must apply through the legacy unjournaled path; asserts log/status and effect/token invariance only'
  }
  $case['Expect'] = { param($case) Invoke-GbdpDpclExpect $case }
  $script:gbdpCases += ,$case
  return $case
}

# DP07: the DP01 shape re-run at D:\ root (files directly under ROOTD, no
# <Name> subdirectory), proving the drive letter is not hard-coded to C:.
# Bespoke Commands sequence (D: / cd \ / ... / C:), per plan 15.7.
function New-GbdpDp07Case {
  $name = 'DP07'
  $saveDir = Join-Path $gbdpRootD 'SAVE'
  New-Item -ItemType Directory -Force $saveDir | Out-Null
  $rosterArg = 'D:\R.GPR'; $saveArg = 'D:\SAVE'; $tokenArg = 'D:\E.DOP'; $effectArg = 'D:\E.EFX'
  Assert-GbdpPathInside $rosterArg "$name roster"; Assert-GbdpPathInside $saveArg "$name save dir"
  Assert-GbdpPathInside $tokenArg "$name token"; Assert-GbdpPathInside $effectArg "$name effect"

  $slots = $gbdpDerangement
  $gbpr = New-GbdpRoster $slots
  $sourceP = New-GbdpSourceMap $slots
  [IO.File]::WriteAllBytes((Join-Path $gbdpRootD 'R.GPR'), $gbpr)
  foreach ($ord in $sourceP.Keys) {
    [IO.File]::WriteAllBytes((Join-Path $saveDir "CHRDATA$($slots[$ord]).GAM"), $sourceP[$ord])
  }
  [IO.File]::WriteAllBytes((Join-Path $gbdpRootD 'E.DOP'), (New-OperationToken 1))
  $events = @((New-GbdpDamageEvent -Target 2 -Value 7))   # the DP01 shape, at D:\ root
  $effectBytes = New-GbdpEffectBytes -Version 14 -Events $events
  [IO.File]::WriteAllBytes((Join-Path $gbdpRootD 'E.EFX'), $effectBytes)

  $mask = Get-GbdpModelMask -Gbpr $gbpr -Events $events
  $model = Get-GbdpModelPost -Gbpr $gbpr -Sources $sourceP -Events $events
  $expectedJournal = New-GbdpExpectedJournal -BasePath 'D:' -Gbpr $gbpr -SourceP $sourceP `
    -Generation 1 -Mask $mask -EffectExtent 5920 -EffectBytes $effectBytes

  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add('D:')
  $lines.Add('cd \')
  $lines.Add("C:\CCHOST.COM /D D:\E.EFX D:\R.GPR /J > C:\$name.LOG")
  $lines.Add("if errorlevel 8 goto ${name}_x")
  $lines.Add("if errorlevel 7 goto ${name}_crash")
  $lines.Add("if errorlevel 1 goto ${name}_bad")
  $lines.Add("echo OK>C:\$name.STA")
  $lines.Add("goto ${name}_done")
  $lines.Add(":${name}_x")
  $lines.Add("echo OTHER>C:\$name.STA")
  $lines.Add("goto ${name}_done")
  $lines.Add(":${name}_crash")
  $lines.Add("echo CRASH>C:\$name.STA")
  $lines.Add("goto ${name}_done")
  $lines.Add(":${name}_bad")
  $lines.Add("echo BAD>C:\$name.STA")
  $lines.Add(":${name}_done")
  $lines.Add('C:')

  $case = @{
    Name = $name; Dir = $gbdpRootD; SaveDir = $saveDir
    Gbpr = $gbpr; SourceP = $sourceP; Slots = $slots; Mask = $mask; Model = $model
    ExpectedJournalBytes = $expectedJournal; ExpectedLog = 'CCHOST: effect damage applied'; ExpectedStatus = 'OK'
    ForeignFiles = @{}
    Commands = $lines.ToArray()
    Setup = 'DP01 shape re-run at D:\ root (ROOTD), proving the drive letter is not hard-coded to C:'
  }
  $case['Expect'] = { param($case) Invoke-GbdpDamageExpect $case }
  $script:gbdpCases += ,$case
  return $case
}

# --- DP01-DP09, DPC ------------------------------------------------------------
$dp01 = New-GbdpDamageCase -Name 'DP01' -Slots $gbdpDerangement -Generation 1 `
  -Events @((New-GbdpDamageEvent -Target 2 -Value 7))

$dp02 = New-GbdpDamageCase -Name 'DP02' -Slots $gbdpDerangement -Generation 1 `
  -Version 9 -GbslExtent 65510 -Events @((New-GbdpDamageEvent -AllTarget -Value 7))
$dp02['AssertJournalMinLength'] = 65536

$gbdpDp03Filler = New-Object byte[] 216
for ($i = 0; $i -lt 216; $i++) { $gbdpDp03Filler[$i] = 0xEE }
$dp03 = New-GbdpDamageCase -Name 'DP03' -Slots ([byte[]](3, 0x81, 5)) -Generation 1 `
  -Events @((New-GbdpDamageEvent -AllTarget -Value 7)) `
  -ForeignFiles @{ 'CHRDATA1.GAM' = $gbdpDp03Filler }

$dp04 = New-GbdpDamageCase -Name 'DP04' -Slots ([byte[]](1, 2, 4)) -Generation 1 `
  -Events @((New-GbdpDamageEvent -Target 5 -Value 7))

$dp05 = New-GbdpDamageCase -Name 'DP05' -Slots $gbdpDerangement -Generation 1 -Events @(
  (New-GbdpDamageEvent -Target 1 -Value 3),
  (New-GbdpDamageEvent -Target 3 -Value 4)
)

$dp06 = New-GbdpDamageCase -Name 'DP06' -Slots $gbdpDerangement -Generation 1 -Events @(
  (New-GbdpDamageEvent -Target 2 -Value 3),
  (New-GbdpDamageEvent -Target 2 -Value 4)
)

$dp07 = New-GbdpDp07Case

# DP08: a v14 effect whose single record has opcode 0x00 (not a DAMAGE record
# at all). Events=@() so the model applies nothing.
$dp08Effect = New-GbefBytes -Version 14
[Text.Encoding]::ASCII.GetBytes('GBSX').CopyTo($dp08Effect, 2246)
Set-U16 $dp08Effect 2250 1
# The 20-byte record at 2252.. is already all-zero (opcode 0x00), which is the
# point of this case.
$dp08 = New-GbdpDamageCase -Name 'DP08' -Slots $gbdpDerangement -Generation 1 -Events @() -EffectBytesOverride $dp08Effect

$dp09 = New-GbdpDamageCase -Name 'DP09' -Slots $gbdpDerangement -Generation 1 `
  -Events @((New-GbdpDamageEvent -Target 33 -Value 7))

$dpc = New-GbdpDpcCase
$dpcl = New-GbdpDpclCase

# --- DR1-DR9, DRG (replacement table) ------------------------------------------
$dr1Gbpr = New-GbdpRoster ([byte[]](3))
$dr1Journal = New-GbdpForeignJournal -State 1 -Generation 7 -EffectPath 'C:\DR1\E.EFX' -TokenPath 'C:\DR1\E.DOP' `
  -RosterPath 'C:\DR1\R.GPR' -SourceDirPath 'C:\DR1\SAVE' -Gbpr $dr1Gbpr -Mask 1
$dr1 = New-GbdpZeroWriteCase -Name 'DR1' -Slots ([byte[]](3)) -Generation 7 `
  -ExpectedLog 'CCHOST: effect damage already committed' -ExpectedStatus 'OK' -PreexistingJournalBytes $dr1Journal

$dr2Slots = $gbdpDerangement
$dr2Gbpr = New-GbdpRoster $dr2Slots
$dr2Journal = New-GbdpForeignJournal -State 1 -Generation 4 -EffectPath 'C:\DR2\E.EFX' -TokenPath 'C:\DR2\E.DOP' `
  -RosterPath 'C:\DR2\R.GPR' -SourceDirPath 'C:\DR2\SAVE' -Gbpr $dr2Gbpr -Mask 1
$dr2 = New-GbdpDamageCase -Name 'DR2' -Slots $dr2Slots -Generation 5 `
  -Events @((New-GbdpDamageEvent -Target 2 -Value 5)) -PreexistingJournalBytes $dr2Journal

$dr3Gbpr = New-GbdpRoster ([byte[]](3))
$dr3Journal = New-GbdpForeignJournal -State 1 -Generation 6 -EffectPath 'C:\DR3\E.EFX' -TokenPath 'C:\DR3\E.DOP' `
  -RosterPath 'C:\DR3\R.GPR' -SourceDirPath 'C:\DR3\SAVE' -Gbpr $dr3Gbpr -Mask 1
$dr3 = New-GbdpZeroWriteCase -Name 'DR3' -Slots ([byte[]](3)) -Generation 5 `
  -ExpectedLog 'CCHOST: invalid host request (result)' -ExpectedStatus 'BAD' -PreexistingJournalBytes $dr3Journal

# DR4: the cross-counter discriminator. The existing R.GDJ is COMMITTED for a
# totally different (effect, token) identity (F.EFX/F.DOP, gen 99) than this
# request's own (E.EFX/E.DOP, gen 3) -- amendment C must recognise this as
# "not the same operation" and proceed as if no journal existed, producing a
# fresh one for the real request.
$dr4Slots = $gbdpDerangement
$dr4Gbpr = New-GbdpRoster $dr4Slots
$dr4Journal = New-GbdpForeignJournal -State 1 -Generation 99 -EffectPath 'C:\DR4\F.EFX' -TokenPath 'C:\DR4\F.DOP' `
  -RosterPath 'C:\DR4\R.GPR' -SourceDirPath 'C:\DR4\SAVE' -Gbpr $dr4Gbpr -Mask 1
$dr4 = New-GbdpDamageCase -Name 'DR4' -Slots $dr4Slots -Generation 3 `
  -Events @((New-GbdpDamageEvent -Target 3 -Value 5)) -PreexistingJournalBytes $dr4Journal

$dr5Gbpr = New-GbdpRoster ([byte[]](3))
$dr5Journal = New-GbdpForeignJournal -State 0 -Generation 1 -EffectPath 'C:\DR5\F.EFX' -TokenPath 'C:\DR5\F.DOP' `
  -RosterPath 'C:\DR5\R.GPR' -SourceDirPath 'C:\DR5\SAVE' -Gbpr $dr5Gbpr -Mask 1
$dr5StaleGdn = New-Object byte[] 10
$dr5 = New-GbdpZeroWriteCase -Name 'DR5' -Slots ([byte[]](3)) -Generation 1 `
  -ExpectedLog 'CCHOST: effect damage recovery required' -ExpectedStatus 'BAD' `
  -PreexistingJournalBytes $dr5Journal -PreexistingGdnBytes $dr5StaleGdn

# DR6 ("same effect", REBUILT for 7b/amendment I): a genuine self-produced
# PREPARED journal whose +32 retained-effect path matches this request's own
# C:\DR6\E.EFX, at the SAME generation as the request's own token, over the
# case's own real preimages -- exactly the shape A1 now classifies as kind 4
# (not kind 1). Unlike 7a's DR6, this is expected to auto-recover: the
# restore step is a no-op (destinations are already at P), then
# .journal_proceed re-produces fresh from that same P and commits. So DR6 is
# no longer a zero-write refusal case at all -- it is New-GbdpDamageCase's own
# "applied" shape, with a PRE-EXISTING PREPARED journal for the SAME identity
# supplied via New-GbdpExpectedJournalState (the CommittedJournalBytes-minus-
# one-byte-state helper), reusing that helper (not New-GbdpForeignJournal,
# whose sources are not the case's own) exactly as plan 20.5 requires.
# DR7 (below, unchanged) is the discriminating control: same +32 match and
# same content, but token generation 2 vs journal generation 1. That is ALSO
# kind 4 now (never kind 1), but the reader's own generation check inside
# recover_damage_journal rejects it -- same outcome text, same zero writes,
# reached by a different internal path. See the re-derivation note below DRG.
$dr6Events = @((New-GbdpDamageEvent -Target 1 -Value 7))
$dr6EffectBytes = New-GbdpEffectBytes -Version 14 -Events $dr6Events
$dr6Gbpr = New-GbdpRoster ([byte[]](3))
$dr6SourceP = New-GbdpSourceMap ([byte[]](3))
$dr6Mask = Get-GbdpModelMask -Gbpr $dr6Gbpr -Events $dr6Events
$dr6Journal = New-GbdpExpectedJournalState -BasePath 'C:\DR6' -Gbpr $dr6Gbpr -SourceP $dr6SourceP `
  -Generation 1 -Mask $dr6Mask -EffectExtent 5920 -EffectBytes $dr6EffectBytes -State 0
$dr6 = New-GbdpDamageCase -Name 'DR6' -Slots ([byte[]](3)) -Generation 1 -Events $dr6Events `
  -PreexistingJournalBytes $dr6Journal -EffectBytesOverride $dr6EffectBytes

$dr7Gbpr = New-GbdpRoster ([byte[]](3))
$dr7EffectBytes = New-GbdpEffectBytes -Version 14 -Events @((New-GbdpDamageEvent -Target 1 -Value 7))
$dr7Journal = New-GbdpForeignJournal -State 0 -Generation 1 -EffectPath 'C:\DR7\E.EFX' -TokenPath 'C:\DR7\E.DOP' `
  -RosterPath 'C:\DR7\R.GPR' -SourceDirPath 'C:\DR7\SAVE' -Gbpr $dr7Gbpr -Mask 1 -EffectBytes $dr7EffectBytes
$dr7 = New-GbdpZeroWriteCase -Name 'DR7' -Slots ([byte[]](3)) -Generation 2 `
  -ExpectedLog 'CCHOST: effect damage recovery required' -ExpectedStatus 'BAD' -PreexistingJournalBytes $dr7Journal `
  -EffectBytes $dr7EffectBytes

$dr8Gbpr = New-GbdpRoster ([byte[]](3))
$dr8Journal = New-GbdpForeignJournal -State 0 -Generation 1 -EffectPath 'C:\DR8\E.EFX' -TokenPath 'C:\DR8\E.DOP' `
  -RosterPath 'C:\DR8\R.GPR' -SourceDirPath 'C:\DR8\SAVE' -Gbpr $dr8Gbpr -Mask 1 -BadMagic
$dr8 = New-GbdpZeroWriteCase -Name 'DR8' -Slots ([byte[]](3)) -Generation 1 `
  -ExpectedLog 'CCHOST: effect damage recovery required' -ExpectedStatus 'BAD' -PreexistingJournalBytes $dr8Journal

$dr9StaleGdn = New-Object byte[] 10
for ($i = 0; $i -lt 10; $i++) { $dr9StaleGdn[$i] = 0xAA }
$dr9 = New-GbdpDamageCase -Name 'DR9' -Slots $gbdpDerangement -Generation 1 `
  -Events @((New-GbdpDamageEvent -Target 4 -Value 5)) -PreexistingGdnBytes $dr9StaleGdn

$drgStaleGdn = New-Object byte[] 10
# C5 (measured, plan checkpoint 7 / §16.3): DOSBox's local drive reports every
# host unlink failure as DOSERR_FILE_NOT_FOUND, so a host READ-ONLY R.GDN's
# 41h delete comes back AX = 2 ("not found") rather than a real failure code.
# D4 treats AX = 2 as "no stale .GDN" and proceeds, so DRG's own "(result)"
# does NOT come from D4's delete-failure branch at all -- it comes from
# damage_journal_produce's later 3Ch create failing on the still-read-only
# name, before anything is written. D4's non-2 branch is unreachable from any
# host fixture; it is witnessed instead by PG (sub-task 7a.4, via the
# CCHOST_TEST_GBDJ_D_FAIL=3 hook). DRG's own expected row is unchanged by
# this: "(result)"/BAD, zero writes, R.GDN byte- and mtime-unchanged.
$drg = New-GbdpZeroWriteCase -Name 'DRG' -Slots ([byte[]](3)) -Generation 1 `
  -ExpectedLog 'CCHOST: invalid host request (result)' -ExpectedStatus 'BAD' `
  -PreexistingGdnBytes $drgStaleGdn -PreexistingGdnReadOnly

# --- Re-derivation note (plan 20.5 step 5, amendment I): every DR row above
# was re-checked against the new kind-4 classification. DR1-DR4 are State=1
# (COMMITTED) and never reach the new PREPARED-only branch at all -- unaffected
# by construction. DR5 keeps a mismatched +32 path (F.EFX, not E.EFX) so it
# stays kind 1 -- unaffected. DR7 and DR8 (below/above) now reach kind 4
# (their +32 DOES match this request's own path) instead of kind 1, but the
# reader's own checks reject both before any write -- DR7 on the generation
# mismatch, DR8 on the corrupted header -- so their outcome text and their
# zero-write shape are BYTE-IDENTICAL to 7a; only the internal path changed.
# DR9 has no pre-existing journal at all -- unaffected. Only DR6 (rebuilt
# above) actually changes observable behaviour.

# --- DR10-DR13 (7b, amendment I: new kind-4 rejection/preflight rows) --------
# DR10: DR6's own shape (own effect/token, matching generation, genuine
# self-produced PREPARED journal, real P preimages) but one destination file
# is host READ-ONLY, so recover_damage_journal's own preflight -- not the
# reader -- is what refuses it, with zero writes.
$dr10Events = @((New-GbdpDamageEvent -Target 1 -Value 7))
$dr10EffectBytes = New-GbdpEffectBytes -Version 14 -Events $dr10Events
$dr10Gbpr = New-GbdpRoster ([byte[]](3))
$dr10SourceP = New-GbdpSourceMap ([byte[]](3))
$dr10Mask = Get-GbdpModelMask -Gbpr $dr10Gbpr -Events $dr10Events
$dr10Journal = New-GbdpExpectedJournalState -BasePath 'C:\DR10' -Gbpr $dr10Gbpr -SourceP $dr10SourceP `
  -Generation 1 -Mask $dr10Mask -EffectExtent 5920 -EffectBytes $dr10EffectBytes -State 0
$dr10 = New-GbdpZeroWriteCase -Name 'DR10' -Slots ([byte[]](3)) -Generation 1 `
  -ExpectedLog 'CCHOST: effect damage recovery target unavailable' -ExpectedStatus 'BAD' `
  -PreexistingJournalBytes $dr10Journal -EffectBytes $dr10EffectBytes
$dr10ReadOnlyFile = Join-Path $dr10.SaveDir 'CHRDATA3.GAM'
Set-ItemProperty -Path $dr10ReadOnlyFile -Name IsReadOnly -Value $true
$gbdpReadOnlyFiles += $dr10ReadOnlyFile

# DR11: DR6's own shape, but the LIVE C:\DR11\E.EFX (not the journal's
# retained copy) has one byte flipped inside the GBSX event body (offset
# 2258, the sole DAMAGE record's Value low byte -- inside the record, not the
# 'GBSX' magic at 2246 or the count at 2250, so the file stays structurally
# parseable). G6's PREPARED-only stream compare of the live effect against
# the journal's retained copy is what refuses it, with zero writes.
$dr11Events = @((New-GbdpDamageEvent -Target 1 -Value 7))
$dr11RetainedEffectBytes = New-GbdpEffectBytes -Version 14 -Events $dr11Events
$dr11Gbpr = New-GbdpRoster ([byte[]](3))
$dr11SourceP = New-GbdpSourceMap ([byte[]](3))
$dr11Mask = Get-GbdpModelMask -Gbpr $dr11Gbpr -Events $dr11Events
$dr11Journal = New-GbdpExpectedJournalState -BasePath 'C:\DR11' -Gbpr $dr11Gbpr -SourceP $dr11SourceP `
  -Generation 1 -Mask $dr11Mask -EffectExtent 5920 -EffectBytes $dr11RetainedEffectBytes -State 0
$dr11CurrentEffectBytes = [byte[]]$dr11RetainedEffectBytes.Clone()
$dr11FlipOffset = 2258
$dr11CurrentEffectBytes[$dr11FlipOffset] = $dr11CurrentEffectBytes[$dr11FlipOffset] -bxor 0xFF
$dr11 = New-GbdpZeroWriteCase -Name 'DR11' -Slots ([byte[]](3)) -Generation 1 `
  -ExpectedLog 'CCHOST: effect damage recovery required' -ExpectedStatus 'BAD' `
  -PreexistingJournalBytes $dr11Journal -EffectBytes $dr11CurrentEffectBytes

# DR12: a genuinely-recoverable PREPARED journal for a DIFFERENT identity
# (F.EFX/F.DOP) sitting beside a request for this case's own identity
# (E.EFX/E.DOP). A1 classifies kind purely on the +32 PATH against the
# CURRENT request, so this stays kind 1 (mismatch) and refuses "recovery
# required" with zero writes on the first command, exactly as 7a's DR5 does
# -- but THIS journal is honestly recoverable, and the row proves it in the
# same case with a follow-up /R for F's own identity, which must print
# "recovered". Built via New-GbdpExpectedJournal's new -EffectName/-TokenName
# (never New-GbdpForeignJournal, whose sources are not the case's own).
$dr12Slots = [byte[]](3)
$dr12Dir = Join-Path $gbdpRun 'DR12'
$dr12SaveDir = Join-Path $dr12Dir 'SAVE'
New-Item -ItemType Directory -Force $dr12Dir | Out-Null
New-Item -ItemType Directory -Force $dr12SaveDir | Out-Null
$dr12RosterArg = 'C:\DR12\R.GPR'; $dr12SaveArg = 'C:\DR12\SAVE'
$dr12TokenArg = 'C:\DR12\E.DOP'; $dr12EffectArg = 'C:\DR12\E.EFX'
Assert-GbdpPathInside $dr12RosterArg 'DR12 roster'; Assert-GbdpPathInside $dr12SaveArg 'DR12 save dir'
Assert-GbdpPathInside $dr12TokenArg 'DR12 token'; Assert-GbdpPathInside $dr12EffectArg 'DR12 effect'
$dr12Gbpr = New-GbdpRoster $dr12Slots
$dr12SourceP = New-GbdpSourceMap $dr12Slots
[IO.File]::WriteAllBytes((Join-Path $dr12Dir 'R.GPR'), $dr12Gbpr)
[IO.File]::WriteAllBytes((Join-Path $dr12Dir 'E.DOP'), (New-OperationToken 1))
$dr12EEffectBytes = $gbdpValidZeroWriteEffect
[IO.File]::WriteAllBytes((Join-Path $dr12Dir 'E.EFX'), $dr12EEffectBytes)
foreach ($slot in $dr12Slots) {
  [IO.File]::WriteAllBytes((Join-Path $dr12SaveDir "CHRDATA$slot.GAM"), (New-GbdrSlotPreimage $slot))
}
$dr12FEvents = @((New-GbdpDamageEvent -Target 1 -Value 9))
$dr12FEffectBytes = New-GbdpEffectBytes -Version 14 -Events $dr12FEvents
$dr12FMask = Get-GbdpModelMask -Gbpr $dr12Gbpr -Events $dr12FEvents
$dr12FJournal = New-GbdpExpectedJournal -BasePath 'C:\DR12' -Gbpr $dr12Gbpr -SourceP $dr12SourceP `
  -Generation 1 -Mask $dr12FMask -EffectExtent 5920 -EffectBytes $dr12FEffectBytes `
  -EffectName 'F.EFX' -TokenName 'F.DOP'
$dr12FJournalPrepared = New-GbdpExpectedJournalState -BasePath 'C:\DR12' -Gbpr $dr12Gbpr -SourceP $dr12SourceP `
  -Generation 1 -Mask $dr12FMask -EffectExtent 5920 -EffectBytes $dr12FEffectBytes -State 0 `
  -EffectName 'F.EFX' -TokenName 'F.DOP'
[IO.File]::WriteAllBytes((Join-Path $dr12Dir 'R.GDJ'), $dr12FJournalPrepared)
[IO.File]::WriteAllBytes((Join-Path $dr12Dir 'F.EFX'), $dr12FEffectBytes)
[IO.File]::WriteAllBytes((Join-Path $dr12Dir 'F.DOP'), (New-OperationToken 1))
$dr12 = New-GbdpZeroWriteThenRecoverRow -Name 'DR12' -Dir $dr12Dir -SaveDir $dr12SaveDir -Slots $dr12Slots `
  -Command1 "C:\CCHOST.COM /D $dr12EffectArg $dr12RosterArg /J" `
  -ExpectedLog1 'CCHOST: effect damage recovery required' -ExpectedStatus1 'BAD' `
  -MExpect {
    param($Case)
    Assert-GbdpMFileBytes $Case 'R.GDJ' $dr12FJournalPrepared
    Assert-GbdpFlatState $Case.MDir @{ Gbpr = $dr12Gbpr; Sources = $dr12SourceP } $dr12Slots 'DR12 <C>M'
  } `
  -Command2 "C:\CCHOST.COM /R $dr12RosterArg $dr12SaveArg" `
  -ExpectedLog2 'CCHOST: effect damage recovered' -ExpectedStatus2 'OK' `
  -FinalExpect {
    param($Case)
    Assert-GbdpRealState $Case @{ Gbpr = $dr12Gbpr; Sources = $dr12SourceP } 'DR12 final'
    # plan §22.5 J.2: Command2's /R was a genuine successful PREPARED
    # restore (this journal is honestly F's own, structurally valid, and
    # /R does not consult identity), so it retired R.GDJ. This supersedes
    # the pre-J "byte-identical PreparedJournalBytes survives" pin.
    Assert-GbdpFileAbsent $Case 'R.GDJ'
  }

# DR13: DR6's own shape, but the token's generation (2) is one higher than
# the journal's own stored generation (1) -- the "step-9 re-mint" shape (plan
# 20.4's lifecycle finding). Still kind 4 (+32 matches), but the reader's
# generation check rejects it, same outcome/zero-write shape as DR6 before
# this amendment.
$dr13Events = @((New-GbdpDamageEvent -Target 1 -Value 7))
$dr13EffectBytes = New-GbdpEffectBytes -Version 14 -Events $dr13Events
$dr13Gbpr = New-GbdpRoster ([byte[]](3))
$dr13SourceP = New-GbdpSourceMap ([byte[]](3))
$dr13Mask = Get-GbdpModelMask -Gbpr $dr13Gbpr -Events $dr13Events
$dr13Journal = New-GbdpExpectedJournalState -BasePath 'C:\DR13' -Gbpr $dr13Gbpr -SourceP $dr13SourceP `
  -Generation 1 -Mask $dr13Mask -EffectExtent 5920 -EffectBytes $dr13EffectBytes -State 0
$dr13 = New-GbdpZeroWriteCase -Name 'DR13' -Slots ([byte[]](3)) -Generation 2 `
  -ExpectedLog 'CCHOST: effect damage recovery required' -ExpectedStatus 'BAD' `
  -PreexistingJournalBytes $dr13Journal -EffectBytes $dr13EffectBytes

# --- DA1-DA6 (argument cases) --------------------------------------------------
$da1 = New-GbdpArgCase -Name 'DA1' -Command 'C:\CCHOST.COM /D C:\DA1\E.EFX C:\DA1\R.GPR /J /T C:\DA1\E.DOP'
$da2 = New-GbdpArgCase -Name 'DA2' -Command 'C:\CCHOST.COM /D C:\DA2\E.EFX C:\DA2\R.GPR /T C:\DA2\E.DOP /J'
$da3 = New-GbdpArgCase -Name 'DA3' -Command 'C:\CCHOST.COM /D c:\da3\e.efx C:\DA3\R.GPR /J'
$da4 = New-GbdpArgCase -Name 'DA4' -Command 'C:\CCHOST.COM /D C:\DA4.D\EFFECT C:\DA4\R.GPR /J' -EffectDirOverride 'DA4.D'
$da5 = New-GbdpArgCase -Name 'DA5' -Command 'C:\CCHOST.COM /D C:\DA5\E.EFX R.GPR /J'
$da6 = New-GbdpArgCase -Name 'DA6' -Command 'C:\CCHOST.COM /D C:\DA6\E.EFX C:\DA6\R.GPR /JX'

# --- Path-safety guard: re-verified once every case is built ------------------
foreach ($c in $gbdpCases) {
  foreach ($k in @('RosterArg', 'SaveArg', 'EffectArg', 'TokenArg')) {
    if ($c.ContainsKey($k)) { Assert-GbdpPathInside $c[$k] "$($c.Name) $k (post-build check)" }
  }
}

# --- Batch construction --------------------------------------------------------
$gbdpBatch = [Text.StringBuilder]::new()
[void]$gbdpBatch.AppendLine('copy C:\CCHOST.RJP C:\CCHOST.COM > nul')
foreach ($c in $gbdpCases) {
  foreach ($line in $c.Commands) { [void]$gbdpBatch.AppendLine($line) }
}
# --- Fault half (sub-task 7a.4a fragment, spliced at checkpoint 8 / plan
# section 17; source native/build/7a4a/gbdp-fault-half.ps1 REGION 1). It builds
# the fault .COM targets via NASM, appends its own case hashtables to this SAME
# $gbdpCases list, and appends its own batch lines directly to this SAME
# $gbdpBatch (the per-case Commands loop above has already run over the
# non-fault cases only), before GBDPCHK.BAT is written below. ---------------
# --- Fault builds -------------------------------------------------------------
# 13 new NASM builds (7 CRASH points + 2 FAIL + 2 SHORT + 1 CORRUPT + the new
# D_FAIL=3 D4 hook from checkpoint 7 / plan section 16.3), plus PL, which
# reuses the top-of-file FAIL_DOK_SAVE_OPEN build verbatim ("$damageWriterFaultCom
# is already the FAIL_DOK_SAVE_OPEN build, so reuse it for PL" -- plan 16.10).
# Every define is %ifdef-guarded in the .inc, so production cchost.com is
# byte-identical with or without any of these test builds (plan 14.6's hook
# table; the new D_FAIL=3 arm is documented in checkpoint 7 section 16.3 as
# adding zero production bytes).
$gbdpFaultBuildDefs = [ordered]@{
  'P1'  = 'CCHOST_TEST_GBDJ_D_CRASH=1'
  'P2'  = 'CCHOST_TEST_GBDJ_D_CRASH=2'
  'P3'  = 'CCHOST_TEST_GBDJ_D_CRASH=3'
  'P4'  = 'CCHOST_TEST_GBDJ_D_CRASH=4'
  'P5'  = 'CCHOST_TEST_GBDJ_D_CRASH=5'
  'P6'  = 'CCHOST_TEST_GBDJ_D_CRASH=6'
  'P7'  = 'CCHOST_TEST_GBDJ_D_CRASH=7'
  'PF1' = 'CCHOST_TEST_GBDJ_D_FAIL=1'
  'PF2' = 'CCHOST_TEST_GBDJ_D_FAIL=2'
  'PW1' = 'CCHOST_TEST_GBDJ_D_SHORT=1'
  'PW2' = 'CCHOST_TEST_GBDJ_D_SHORT=2'
  'PV'  = 'CCHOST_TEST_GBDJ_D_CORRUPT=1'
  'PG'  = 'CCHOST_TEST_GBDJ_D_FAIL=3'
  # 7b (amendment I: kind-4 auto-recover). RK1/RF0 reuse the restore
  # routine's OWN existing crash/fail hooks (already proven by GBDR's own
  # RK1/RF0 cases in this same file) to probe the NEW auto-recover call
  # inside damage_journal_check_existing, without inventing a new hook. PH8
  # reuses A3's handle-budget instrumentation (already proven by the
  # existing H8/H9 GBDJ fixtures) to prove the auto-recover call's own peak
  # handle usage still fits the DOS budget.
  'RK1' = 'CCHOST_TEST_GBDJ_CRASH_AT=1'
  'RF0' = 'CCHOST_TEST_GBDJ_FAIL_AT=0'
  'PH8' = 'CCHOST_TEST_GBDJ_HOLD_HANDLES=8'
}
foreach ($ext in $gbdpFaultBuildDefs.Keys) {
  $define = $gbdpFaultBuildDefs[$ext]
  $comPath = Join-Path $build "cchost-gbdp-fault-$($ext.ToLowerInvariant()).com"
  & $nasm -f bin -I ((Join-Path $native 'src') + '/') -D $define (Join-Path $native 'src\cchost.asm') -o $comPath
  if ($LASTEXITCODE -ne 0) { throw "NASM did not build CCHOST GBDP fault fixture $ext ($define)" }
  Copy-Item $comPath (Join-Path $gbdpRun "CCHOST.$ext") -Force
}
Copy-Item $damageWriterFaultCom (Join-Path $gbdpRun 'CCHOST.PL') -Force

# --- Pure helper 2: the CCHOST_TEST_GBDJ_D_CRASH=4 on-disk state -------------
# "in the write pass, the first time only, immediately before
# call write_dok_save_damage (GBPR HP+flags written, source not)" (plan
# 14.6's hook table). The write pass writes each targeted member's GBPR
# HP/flags words to R.GPR BEFORE attempting that member's own CHRDATA source
# write (amendment F's write-order, confirmed by this same hook's own
# parenthetical); D_CRASH=4 fires on the very first such source-write
# attempt across the whole pass. So exactly one ordinal (the first one the
# pass reaches) has its GBPR entry already updated while its own source, and
# every other ordinal's GBPR entry and source, are still untouched preimages.
# This is a pure partial application of Get-GbdpModelPost (AST-extracted from
# cchost-test.ps1 by the self-check): it computes the FULL post state once,
# then copies back only ordinal 0's GBPR HP/flags words onto an otherwise
# untouched preimage clone, leaving every source (including ordinal 0's own)
# at the original preimage.
function Get-GbdpCrash4Model {
  param(
    [Parameter(Mandatory)][byte[]]$Gbpr,
    [Parameter(Mandatory)][hashtable]$Sources,
    [Parameter(Mandatory)][array]$Events
  )
  $full = Get-GbdpModelPost -Gbpr $Gbpr -Sources $Sources -Events $Events
  $partialGbpr = [byte[]]$Gbpr.Clone()
  $off = 16   # ordinal 0
  $hpOff = $off + 1 + 216 + 6
  $flagsOff = $off + 1 + 216 + 4
  [Array]::Copy($full.Gbpr, $hpOff, $partialGbpr, $hpOff, 2)
  [Array]::Copy($full.Gbpr, $flagsOff, $partialGbpr, $flagsOff, 2)
  $partialSources = @{}
  foreach ($k in $Sources.Keys) { $partialSources[$k] = [byte[]]$Sources[$k].Clone() }
  return @{ Gbpr = $partialGbpr; Sources = $partialSources }
}

# --- Fixture builder: one <C> directory (R.GPR/E.DOP/E.EFX/SAVE, optional
# pre-existing R.GDJ/R.GDN, optional host-side <C>M scratch dir) -------------
function New-GbdpFaultFixtureDir {
  param(
    [Parameter(Mandatory)][string]$Name,
    [byte[]]$Slots = $gbdpDerangement,
    [Parameter(Mandatory)][array]$Events,
    [UInt64]$Generation = 1,
    [byte[]]$PreexistingJournalBytes = $null,
    [byte[]]$PreexistingGdnBytes = $null,
    [switch]$WithMDir
  )
  $dir = Join-Path $gbdpRun $Name
  $saveDir = Join-Path $dir 'SAVE'
  New-Item -ItemType Directory -Force $dir | Out-Null
  New-Item -ItemType Directory -Force $saveDir | Out-Null
  $mDir = $null
  if ($WithMDir) {
    $mDir = Join-Path $gbdpRun "${Name}M"
    New-Item -ItemType Directory -Force $mDir | Out-Null
  }

  $rosterArg = "C:\$Name\R.GPR"; $saveArg = "C:\$Name\SAVE"
  $tokenArg = "C:\$Name\E.DOP"; $effectArg = "C:\$Name\E.EFX"
  Assert-GbdpPathInside $rosterArg "$Name roster"; Assert-GbdpPathInside $saveArg "$Name save dir"
  Assert-GbdpPathInside $tokenArg "$Name token"; Assert-GbdpPathInside $effectArg "$Name effect"

  $gbpr = New-GbdpRoster $Slots
  $sourceP = New-GbdpSourceMap $Slots
  [IO.File]::WriteAllBytes((Join-Path $dir 'R.GPR'), $gbpr)
  foreach ($ord in $sourceP.Keys) {
    [IO.File]::WriteAllBytes((Join-Path $saveDir "CHRDATA$($Slots[$ord]).GAM"), $sourceP[$ord])
  }
  [IO.File]::WriteAllBytes((Join-Path $dir 'E.DOP'), (New-OperationToken $Generation))
  $effectBytes = New-GbdpEffectBytes -Version 14 -Events $Events
  [IO.File]::WriteAllBytes((Join-Path $dir 'E.EFX'), $effectBytes)
  if ($null -ne $PreexistingJournalBytes) { [IO.File]::WriteAllBytes((Join-Path $dir 'R.GDJ'), $PreexistingJournalBytes) }
  if ($null -ne $PreexistingGdnBytes) { [IO.File]::WriteAllBytes((Join-Path $dir 'R.GDN'), $PreexistingGdnBytes) }

  $mask = Get-GbdpModelMask -Gbpr $gbpr -Events $Events
  $model = Get-GbdpModelPost -Gbpr $gbpr -Sources $sourceP -Events $Events
  $committedJournalBytes = $null
  $preparedJournalBytes = $null
  if ($mask -ne 0) {
    $committedJournalBytes = New-GbdpExpectedJournal -BasePath "C:\$Name" -Gbpr $gbpr -SourceP $sourceP `
      -Generation $Generation -Mask $mask -EffectExtent 5920 -EffectBytes $effectBytes
    $preparedJournalBytes = New-GbdpExpectedJournalState -BasePath "C:\$Name" -Gbpr $gbpr -SourceP $sourceP `
      -Generation $Generation -Mask $mask -EffectExtent 5920 -EffectBytes $effectBytes -State 0
  }

  return @{
    Name = $Name; Dir = $dir; SaveDir = $saveDir; MDir = $mDir
    RosterArg = $rosterArg; SaveArg = $saveArg; TokenArg = $tokenArg; EffectArg = $effectArg
    Gbpr = $gbpr; SourceP = $sourceP; Slots = $Slots; Generation = $Generation; Events = $Events
    Mask = $mask; Model = $model
    CommittedJournalBytes = $committedJournalBytes; PreparedJournalBytes = $preparedJournalBytes
  }
}

# --- Shared step-outcome / on-disk assertion helpers --------------------------
function Get-GbdpFaultStepOutcome([string]$StepName) {
  $logRaw = Get-Content (Join-Path $gbdpRun "$StepName.LOG") -Raw
  $log = if ($null -eq $logRaw) { '' } else { $logRaw.Trim() }
  $status = (Get-Content (Join-Path $gbdpRun "$StepName.STA") -Raw).Trim()
  return @{ Log = $log; Status = $status }
}
function Assert-GbdpFaultStepOutcome([string]$StepName, [string]$ExpectedLog, [string]$ExpectedStatus) {
  $r = Get-GbdpFaultStepOutcome $StepName
  if ($r.Log -ne $ExpectedLog -or $r.Status -ne $ExpectedStatus) {
    throw "$StepName expected log '$ExpectedLog' status '$ExpectedStatus', got log '$($r.Log)' status '$($r.Status)'"
  }
}
function Assert-GbdpMFileAbsent([hashtable]$Case, [string]$FileName) {
  if (Test-Path (Join-Path $Case.MDir $FileName)) { throw "$($Case.Name) <C>M: $FileName unexpectedly present" }
}
function Assert-GbdpMFileBytes([hashtable]$Case, [string]$FileName, [byte[]]$Expected) {
  $path = Join-Path $Case.MDir $FileName
  if (-not (Test-Path $path)) { throw "$($Case.Name) <C>M: $FileName missing" }
  Assert-GbdpBytesEqual ([IO.File]::ReadAllBytes($path)) $Expected "$($Case.Name) <C>M $FileName"
}
# plan §22.5 J.2: real-directory (not <C>M-scoped) counterpart to
# Assert-GbdpMFileAbsent, for asserting a journal was retired (deleted) in
# the case's own live directory after a successful /R.
function Assert-GbdpFileAbsent([hashtable]$Case, [string]$FileName) {
  if (Test-Path (Join-Path $Case.Dir $FileName)) { throw "$($Case.Name): $FileName unexpectedly present (expected retired)" }
}
# The <C>M snapshot copy is FLAT (SAVE\*.* is copied straight into <C>M, no
# nested SAVE subdirectory), matching the GBDR fault convention
# (Get-GbdrUnitPathFlat). $State is @{ Gbpr; Sources } as returned by
# Get-GbdpModelPost / Get-GbdpCrash4Model, or an equivalent literal preimage.
function Assert-GbdpFlatState([string]$FlatDir, [hashtable]$State, [byte[]]$Slots, [string]$Label) {
  Assert-GbdpBytesEqual ([IO.File]::ReadAllBytes((Join-Path $FlatDir 'R.GPR'))) $State.Gbpr "$Label R.GPR"
  foreach ($ord in $State.Sources.Keys) {
    $slot = $Slots[$ord]
    Assert-GbdpBytesEqual ([IO.File]::ReadAllBytes((Join-Path $FlatDir "CHRDATA$slot.GAM"))) $State.Sources[$ord] "$Label CHRDATA$slot.GAM"
  }
}
function Assert-GbdpRealState([hashtable]$Case, [hashtable]$State, [string]$Label) {
  Assert-GbdpBytesEqual ([IO.File]::ReadAllBytes((Join-Path $Case.Dir 'R.GPR'))) $State.Gbpr "$Label R.GPR"
  foreach ($ord in $State.Sources.Keys) {
    $slot = $Case.Fixture.Slots[$ord]
    Assert-GbdpBytesEqual ([IO.File]::ReadAllBytes((Join-Path $Case.SaveDir "CHRDATA$slot.GAM"))) $State.Sources[$ord] "$Label CHRDATA$slot.GAM"
  }
}

# --- Row builder 1: the crash / fail / short / corrupt rows with a <C>M
# snapshot and one or two production follow-up commands (PK1-PK7, PF1, PW1,
# PL). Sequence, per plan 14.6: fault build -> copy to <C>M -> the follow-up
# command(s) -> final assertions. -------------------------------------------
function New-GbdpFaultRow {
  param(
    [Parameter(Mandatory)][hashtable]$Fixture,
    [Parameter(Mandatory)][string]$BuildExt,
    [Parameter(Mandatory)][ValidateSet('CRASH', 'BAD')][string]$FStatus,
    [string]$FLog = $null,
    [Parameter(Mandatory)][scriptblock]$MExpect,
    # 7b (A2/A3 probe): an optional SECOND alternate-build command, run
    # between the crash's <C>M snapshot and the production-build restore,
    # with its own <C>P host-side flat snapshot and an optional verifier.
    # Used only by PKR/PKF to probe the NEW kind-4 auto-recover call's own
    # crash/fail hooks; every one of the seven existing FollowUps-only
    # callers (PK1-PK7/PF1/PW1/PL) passes none of these, so $ProbeBuildExt
    # stays $null for them and every `if ($ProbeBuildExt)` branch below is
    # skipped -- the emitted Commands/Expect sequence for those seven is
    # byte-for-byte what it was before this parameter existed.
    [string]$ProbeBuildExt = $null,
    [string]$ProbeCommand = $null,
    [string]$ProbeExpectedLog = $null,
    [ValidateSet('OK', 'BAD', 'CRASH')][string]$ProbeExpectedStatus = 'OK',
    [scriptblock]$ProbeExpect = $null,
    [array]$FollowUps = @(),
    [Parameter(Mandatory)][scriptblock]$FinalExpect
  )
  $name = $Fixture.Name
  $lines = New-Object System.Collections.Generic.List[string]
  [void]$lines.Add("copy C:\CCHOST.$BuildExt C:\CCHOST.COM > nul")
  $lines.AddRange((New-GbdpCommandLines -Name "${name}_F" -CdTarget $name -Command "C:\CCHOST.COM /D $($Fixture.EffectArg) $($Fixture.RosterArg) /J"))
  [void]$lines.Add("copy C:\$name\R.GPR C:\${name}M > nul")
  [void]$lines.Add("if exist C:\$name\R.GDJ copy C:\$name\R.GDJ C:\${name}M > nul")
  [void]$lines.Add("if exist C:\$name\R.GDN copy C:\$name\R.GDN C:\${name}M > nul")
  [void]$lines.Add("copy C:\$name\SAVE\*.* C:\${name}M > nul")
  $probeDir = $null
  if ($ProbeBuildExt) {
    $probeDir = Join-Path $gbdpRun "${name}P"
    New-Item -ItemType Directory -Force $probeDir | Out-Null
    [void]$lines.Add("copy C:\CCHOST.$ProbeBuildExt C:\CCHOST.COM > nul")
    $lines.AddRange((New-GbdpCommandLines -Name "${name}_P" -CdTarget $name -Command $ProbeCommand))
    [void]$lines.Add("copy C:\$name\R.GPR C:\${name}P > nul")
    [void]$lines.Add("if exist C:\$name\R.GDJ copy C:\$name\R.GDJ C:\${name}P > nul")
    [void]$lines.Add("if exist C:\$name\R.GDN copy C:\$name\R.GDN C:\${name}P > nul")
    [void]$lines.Add("copy C:\$name\SAVE\*.* C:\${name}P > nul")
  }
  [void]$lines.Add('copy C:\CCHOST.RJP C:\CCHOST.COM > nul')
  $k = 1
  foreach ($fu in $FollowUps) {
    $lines.AddRange((New-GbdpCommandLines -Name "${name}_R$k" -CdTarget $name -Command $fu.Command))
    $k++
  }

  $case = @{
    Name = $name; Dir = $Fixture.Dir; SaveDir = $Fixture.SaveDir; MDir = $Fixture.MDir; ProbeDir = $probeDir
    Fixture = $Fixture; FollowUps = $FollowUps
    Commands = $lines.ToArray()
    Setup = "fault row: build=$BuildExt FStatus=$FStatus followUps=$($FollowUps.Count) probe=$ProbeBuildExt"
  }
  $case['ExpectedFLog'] = if ($FStatus -eq 'CRASH') { '' } else { $FLog }
  $case['FStatus'] = $FStatus
  $case['MExpect'] = $MExpect
  $case['HasProbe'] = [bool]$ProbeBuildExt
  $case['ExpectedProbeLog'] = if ($ProbeExpectedStatus -eq 'CRASH') { '' } else { $ProbeExpectedLog }
  $case['ProbeExpectedStatus'] = $ProbeExpectedStatus
  $case['ProbeExpect'] = $ProbeExpect
  $case['FinalExpect'] = $FinalExpect
  $case['Expect'] = {
    param($case)
    Assert-GbdpFaultStepOutcome "$($case.Name)_F" $case.ExpectedFLog $case.FStatus
    & $case.MExpect $case.Fixture $case
    if ($case.HasProbe) {
      Assert-GbdpFaultStepOutcome "$($case.Name)_P" $case.ExpectedProbeLog $case.ProbeExpectedStatus
      if ($case.ProbeExpect) { & $case.ProbeExpect $case.Fixture $case }
    }
    $k2 = 1
    foreach ($fu2 in $case.FollowUps) {
      Assert-GbdpFaultStepOutcome "$($case.Name)_R$k2" $fu2.ExpectedLog $fu2.ExpectedStatus
      $k2++
    }
    & $case.FinalExpect $case.Fixture $case
  }

  $script:gbdpCases += ,$case
  foreach ($line in $case.Commands) { [void]$script:gbdpBatch.AppendLine($line) }
  # Checkpoint 8: no return value -- these builders are called as bare
  # statements, and a returned hashtable was dumped to the harness output.
}

# Checkpoint 8 (plan section 17.4): PF2/PW2/PV fail AFTER produce's 3Ch has
# created R.GDN, and D3 then deletes it. That create-then-delete moves the case
# directory's own mtime, so Invoke-GbdpZeroWriteExpect's C2 "case directory
# mtime unchanged" check is stricter than their section 14.6 row ("no
# .GDN/.GDJ; dest byte- and mtime-identical") and would fail for a CORRECT
# producer. This expect asserts the row exactly -- every file under the case
# directory (destinations, token, effect) byte-, size- and mtime-identical,
# the same file set (so no .GDN/.GDJ appeared), and the SAVE directory's mtime
# unchanged -- and turns the case directory's mtime into a TWO-SIDED witness:
# it must have CHANGED, which proves the fault point really was reached after
# the .GDN was created (a refusal before 3Ch, e.g. a hook that never fired,
# would leave it unchanged and go red here instead of passing vacuously).
function Invoke-GbdpGdnCleanupExpect([hashtable]$Case) {
  $log = (Get-Content (Join-Path $gbdpRun "$($Case.Name).LOG") -Raw).Trim()
  $status = (Get-Content (Join-Path $gbdpRun "$($Case.Name).STA") -Raw).Trim()
  if ($log -ne $Case.ExpectedLog -or $status -ne $Case.ExpectedStatus) {
    throw "$($Case.Name): expected log '$($Case.ExpectedLog)' status '$($Case.ExpectedStatus)', got log '$log' status '$status'"
  }
  $relDir = $Case.Dir.Substring($gbdpRun.Length)
  $relDirPrefix = $relDir + [IO.Path]::DirectorySeparatorChar
  $beforeFiles = @($gbdpBefore.Files | Where-Object { $_.Path.StartsWith($relDirPrefix, [StringComparison]::OrdinalIgnoreCase) })
  $afterMap = @{}
  foreach ($f in ($gbdpAfter.Files | Where-Object { $_.Path.StartsWith($relDirPrefix, [StringComparison]::OrdinalIgnoreCase) })) { $afterMap[$f.Path] = $f }
  foreach ($bf in $beforeFiles) {
    $af = $afterMap[$bf.Path]
    if ($null -eq $af) { throw "$($Case.Name): $($bf.Path) disappeared between snapshots" }
    if ($af.Size -ne $bf.Size -or $af.LastWriteTimeUtc -ne $bf.LastWriteTimeUtc -or $af.Hash -ne $bf.Hash) {
      throw "$($Case.Name): $($bf.Path) changed between snapshots"
    }
  }
  if ($afterMap.Count -ne $beforeFiles.Count) {
    $extra = @($afterMap.Keys | Where-Object { $p = $_; -not ($beforeFiles | Where-Object { $_.Path -eq $p }) }) -join ', '
    throw "$($Case.Name): file set under $relDir changed between snapshots (new: $extra)"
  }
  Assert-GbdpDirUnchanged $Case.SaveDir "$($Case.Name) SAVE directory"
  $b = $gbdpBefore.Dirs | Where-Object { $_.Path -eq $relDir } | Select-Object -First 1
  $a = $gbdpAfter.Dirs | Where-Object { $_.Path -eq $relDir } | Select-Object -First 1
  if ($null -eq $b -or $null -eq $a) { throw "$($Case.Name) case directory ($relDir) missing from a directory snapshot" }
  if ($b.LastWriteTimeUtc -eq $a.LastWriteTimeUtc) {
    throw "$($Case.Name) case directory ($relDir) mtime UNCHANGED: the .GDN was never created, so the fault point after 3Ch was not reached"
  }
}

# --- Row builder 2: the terminal zero-write rows (PF2, PW2, PV, PG). These
# reach a normal BAD exit on the FIRST (and only) run -- no crash marker, no
# <C>M snapshot, no follow-up -- so they reuse 7a.2's own
# Invoke-GbdpZeroWriteExpect / Assert-GbdpCaseSnapshotIdentical exactly as the
# non-fault half's DR1/DR3/DR5-DR8/DRG rows already do. This is a deliberate
# reading of plan 14.6/16.10's general "fault build -> copy to <C>M -> the
# follow-up command(s) -> final assertions" sequence: these four rows' own
# table entries all show "Then: --", so there is nothing for a <C>M snapshot
# to add over the final directory state (they are identical by construction,
# since nothing is ever written) -- see this fragment's own report for why
# this reading was chosen over creating an unused <C>M copy for all four. ---
function New-GbdpFaultZeroWriteRow {
  param(
    [Parameter(Mandatory)][hashtable]$Fixture,
    [Parameter(Mandatory)][string]$BuildExt,
    [Parameter(Mandatory)][string]$ExpectedLog,
    [switch]$GdnCreatedThenDeleted
  )
  $name = $Fixture.Name
  $lines = New-Object System.Collections.Generic.List[string]
  [void]$lines.Add("copy C:\CCHOST.$BuildExt C:\CCHOST.COM > nul")
  $lines.AddRange((New-GbdpCommandLines -Name $name -CdTarget $name -Command "C:\CCHOST.COM /D $($Fixture.EffectArg) $($Fixture.RosterArg) /J"))
  [void]$lines.Add('copy C:\CCHOST.RJP C:\CCHOST.COM > nul')

  $case = @{
    Name = $name; Dir = $Fixture.Dir; SaveDir = $Fixture.SaveDir
    Fixture = $Fixture
    ExpectedLog = $ExpectedLog; ExpectedStatus = 'BAD'
    Commands = $lines.ToArray()
    Setup = "fault zero-write row: build=$BuildExt GdnCreatedThenDeleted=$([bool]$GdnCreatedThenDeleted)"
  }
  if ($GdnCreatedThenDeleted) {
    $case['Expect'] = { param($case) Invoke-GbdpGdnCleanupExpect $case }
  } else {
    $case['Expect'] = { param($case) Invoke-GbdpZeroWriteExpect $case }
  }

  $script:gbdpCases += ,$case
  foreach ($line in $case.Commands) { [void]$script:gbdpBatch.AppendLine($line) }
  # Checkpoint 8: no return value -- these builders are called as bare
  # statements, and a returned hashtable was dumped to the harness output.
}

# --- PK1: build P1. DP01 shape (target 2, value 7), DR roster, no
# pre-existing journal. CRASH_AT=1: after the .GDN is closed and
# self-verified, before the old .GDJ is deleted (none existed here). --------
$pk1Fixture = New-GbdpFaultFixtureDir -Name 'PK1' -Slots $gbdpDerangement -Generation 1 `
  -Events @((New-GbdpDamageEvent -Target 2 -Value 7)) -WithMDir
New-GbdpFaultRow -Fixture $pk1Fixture -BuildExt 'P1' -FStatus 'CRASH' `
  -MExpect {
    param($Fixture, $Case)
    Assert-GbdpMFileAbsent $Case 'R.GDJ'
    Assert-GbdpMFileBytes $Case 'R.GDN' $Fixture.PreparedJournalBytes
    Assert-GbdpFlatState $Case.MDir @{ Gbpr = $Fixture.Gbpr; Sources = $Fixture.SourceP } $Fixture.Slots "$($Case.Name) <C>M"
  } `
  -FollowUps @(
    @{ Command = "C:\CCHOST.COM /D $($pk1Fixture.EffectArg) $($pk1Fixture.RosterArg) /J"; ExpectedLog = 'CCHOST: effect damage applied'; ExpectedStatus = 'OK' }
  ) `
  -FinalExpect {
    param($Fixture, $Case)
    if (Test-Path (Join-Path $Case.Dir 'R.GDN')) { throw "$($Case.Name): final R.GDN unexpectedly present" }
    Assert-GbdpBytesEqual ([IO.File]::ReadAllBytes((Join-Path $Case.Dir 'R.GDJ'))) $Fixture.CommittedJournalBytes "$($Case.Name) final R.GDJ"
    Assert-GbdpRealState $Case $Fixture.Model "$($Case.Name) final"
  }

# --- PK2: build P2, DR2's own setup (pre-existing COMMITTED journal at
# generation 4, this request's token generation 5, target 2 value 5).
# CRASH_AT=2: after the old .GDJ is deleted (it is replaceable), before the
# rename -- so at crash time no .GDJ exists, but this operation's OWN fresh
# .GDN does. -------------------------------------------------------------
$pk2ForeignGbpr = New-GbdpRoster $gbdpDerangement
$pk2ForeignJournal = New-GbdpForeignJournal -State 1 -Generation 4 -EffectPath 'C:\PK2\E.EFX' -TokenPath 'C:\PK2\E.DOP' `
  -RosterPath 'C:\PK2\R.GPR' -SourceDirPath 'C:\PK2\SAVE' -Gbpr $pk2ForeignGbpr -Mask 1
$pk2Fixture = New-GbdpFaultFixtureDir -Name 'PK2' -Slots $gbdpDerangement -Generation 5 `
  -Events @((New-GbdpDamageEvent -Target 2 -Value 5)) -PreexistingJournalBytes $pk2ForeignJournal -WithMDir
New-GbdpFaultRow -Fixture $pk2Fixture -BuildExt 'P2' -FStatus 'CRASH' `
  -MExpect {
    param($Fixture, $Case)
    Assert-GbdpMFileAbsent $Case 'R.GDJ'
    Assert-GbdpMFileBytes $Case 'R.GDN' $Fixture.PreparedJournalBytes
    Assert-GbdpFlatState $Case.MDir @{ Gbpr = $Fixture.Gbpr; Sources = $Fixture.SourceP } $Fixture.Slots "$($Case.Name) <C>M"
  } `
  -FollowUps @(
    @{ Command = "C:\CCHOST.COM /D $($pk2Fixture.EffectArg) $($pk2Fixture.RosterArg) /J"; ExpectedLog = 'CCHOST: effect damage applied'; ExpectedStatus = 'OK' }
  ) `
  -FinalExpect {
    param($Fixture, $Case)
    if (Test-Path (Join-Path $Case.Dir 'R.GDN')) { throw "$($Case.Name): final R.GDN unexpectedly present" }
    Assert-GbdpBytesEqual ([IO.File]::ReadAllBytes((Join-Path $Case.Dir 'R.GDJ'))) $Fixture.CommittedJournalBytes "$($Case.Name) final R.GDJ"
    Assert-GbdpRealState $Case $Fixture.Model "$($Case.Name) final"
  }

# --- PK3: build P3. CRASH_AT=3: after the rename, before the write pass --
# so a genuine PREPARED .GDJ exists and every destination is still preimage.
# /R is a no-op recovery (nothing was ever damaged). CHANGED for 7b/amendment
# I: the retry /D /J used to be refused (7a's "PREPARED, same effect ->
# refuse" row, amendment C) -- it now auto-recovers (kind 4: +32 matches,
# same generation), and since /R already restored destinations to P, the
# recover call's own restore is a no-op and .journal_proceed re-produces
# fresh from that same P, applying the event exactly once and committing.
$pk3Fixture = New-GbdpFaultFixtureDir -Name 'PK3' -Slots $gbdpDerangement -Generation 1 `
  -Events @((New-GbdpDamageEvent -Target 2 -Value 7)) -WithMDir
New-GbdpFaultRow -Fixture $pk3Fixture -BuildExt 'P3' -FStatus 'CRASH' `
  -MExpect {
    param($Fixture, $Case)
    Assert-GbdpMFileBytes $Case 'R.GDJ' $Fixture.PreparedJournalBytes
    if (Test-Path (Join-Path $Case.MDir 'R.GDN')) { throw "$($Case.Name) <C>M: R.GDN unexpectedly present" }
    Assert-GbdpFlatState $Case.MDir @{ Gbpr = $Fixture.Gbpr; Sources = $Fixture.SourceP } $Fixture.Slots "$($Case.Name) <C>M"
  } `
  -FollowUps @(
    @{ Command = "C:\CCHOST.COM /R $($pk3Fixture.RosterArg) $($pk3Fixture.SaveArg)"; ExpectedLog = 'CCHOST: effect damage recovered'; ExpectedStatus = 'OK' },
    @{ Command = "C:\CCHOST.COM /D $($pk3Fixture.EffectArg) $($pk3Fixture.RosterArg) /J"; ExpectedLog = 'CCHOST: effect damage applied'; ExpectedStatus = 'OK' }
  ) `
  -FinalExpect {
    param($Fixture, $Case)
    Assert-GbdpBytesEqual ([IO.File]::ReadAllBytes((Join-Path $Case.Dir 'R.GDJ'))) $Fixture.CommittedJournalBytes "$($Case.Name) final R.GDJ"
    Assert-GbdpRealState $Case $Fixture.Model "$($Case.Name) final"
  }

# --- PK4: build P4, all-target event. CRASH_AT=4: GBPR ordinal 0 HP/flags
# written, its own source (and everything else) still preimage. ------------
$pk4Fixture = New-GbdpFaultFixtureDir -Name 'PK4' -Slots $gbdpDerangement -Generation 1 `
  -Events @((New-GbdpDamageEvent -AllTarget -Value 7)) -WithMDir
New-GbdpFaultRow -Fixture $pk4Fixture -BuildExt 'P4' -FStatus 'CRASH' `
  -MExpect {
    param($Fixture, $Case)
    $partial = Get-GbdpCrash4Model -Gbpr $Fixture.Gbpr -Sources $Fixture.SourceP -Events $Fixture.Events
    Assert-GbdpFlatState $Case.MDir $partial $Fixture.Slots "$($Case.Name) <C>M"
  } `
  -FollowUps @(
    @{ Command = "C:\CCHOST.COM /R $($pk4Fixture.RosterArg) $($pk4Fixture.SaveArg)"; ExpectedLog = 'CCHOST: effect damage recovered'; ExpectedStatus = 'OK' }
  ) `
  -FinalExpect {
    param($Fixture, $Case)
    Assert-GbdpFileAbsent $Case 'R.GDJ'  # plan §22.5 J.2: /R retired it
    Assert-GbdpRealState $Case @{ Gbpr = $Fixture.Gbpr; Sources = $Fixture.SourceP } "$($Case.Name) final"
  }

# --- PK5: build P5, DP05 events (target 1 v3, target 3 v4). CRASH_AT=5:
# after the first event's apply_damage_value_to_roster returns -- event 1
# (ordinal 0) fully applied, event 2 (ordinal 2) untouched. -----------------
$pk5Events = @((New-GbdpDamageEvent -Target 1 -Value 3), (New-GbdpDamageEvent -Target 3 -Value 4))
$pk5Fixture = New-GbdpFaultFixtureDir -Name 'PK5' -Slots $gbdpDerangement -Generation 1 -Events $pk5Events -WithMDir
New-GbdpFaultRow -Fixture $pk5Fixture -BuildExt 'P5' -FStatus 'CRASH' `
  -MExpect {
    param($Fixture, $Case)
    $partial = Get-GbdpModelPost -Gbpr $Fixture.Gbpr -Sources $Fixture.SourceP -Events @($Fixture.Events[0])
    Assert-GbdpFlatState $Case.MDir $partial $Fixture.Slots "$($Case.Name) <C>M"
  } `
  -FollowUps @(
    @{ Command = "C:\CCHOST.COM /R $($pk5Fixture.RosterArg) $($pk5Fixture.SaveArg)"; ExpectedLog = 'CCHOST: effect damage recovered'; ExpectedStatus = 'OK' }
  ) `
  -FinalExpect {
    param($Fixture, $Case)
    Assert-GbdpFileAbsent $Case 'R.GDJ'  # plan §22.5 J.2: /R retired it
    Assert-GbdpRealState $Case @{ Gbpr = $Fixture.Gbpr; Sources = $Fixture.SourceP } "$($Case.Name) final"
  }

# --- PK6: build P6. CRASH_AT=6: after the write pass, before the commit
# open -- every destination is fully post, but the .GDJ is still PREPARED. -
$pk6Fixture = New-GbdpFaultFixtureDir -Name 'PK6' -Slots $gbdpDerangement -Generation 1 `
  -Events @((New-GbdpDamageEvent -Target 2 -Value 7)) -WithMDir
New-GbdpFaultRow -Fixture $pk6Fixture -BuildExt 'P6' -FStatus 'CRASH' `
  -MExpect {
    param($Fixture, $Case)
    Assert-GbdpMFileBytes $Case 'R.GDJ' $Fixture.PreparedJournalBytes
    Assert-GbdpFlatState $Case.MDir $Fixture.Model $Fixture.Slots "$($Case.Name) <C>M"
  } `
  -FollowUps @(
    @{ Command = "C:\CCHOST.COM /R $($pk6Fixture.RosterArg) $($pk6Fixture.SaveArg)"; ExpectedLog = 'CCHOST: effect damage recovered'; ExpectedStatus = 'OK' }
  ) `
  -FinalExpect {
    param($Fixture, $Case)
    Assert-GbdpFileAbsent $Case 'R.GDJ'  # plan §22.5 J.2: /R retired it
    Assert-GbdpRealState $Case @{ Gbpr = $Fixture.Gbpr; Sources = $Fixture.SourceP } "$($Case.Name) final"
  }

# --- PK7: build P7. CRASH_AT=7: after the commit close, before the success
# line -- every destination is post AND the .GDJ is already COMMITTED.
# CHANGED for 7b/amendment I (A4, plan 20.5/17.5): the two follow-ups (/R,
# then a /D /J retry, both "already committed" -- kind 3, State=1, untouched
# by the new kind-4 branch) MOVE OUT of this session entirely, into a SECOND
# DOSBox session below (after this session's own summary line), so a host
# snapshot can bracket them by real wall-clock time -- FAT's ~2s mtime
# granularity cannot otherwise tell "untouched by /R" apart from "rewritten
# with the same bytes" when both happen inside the crash session's own
# before/after pair. This row now runs ONLY the crash command; its MExpect is
# UNCHANGED (still <C>M against CommittedJournalBytes/Model, since the crash
# itself already left a byte-complete COMMITTED write), and its FinalExpect
# below is simply the same claim made about the real (non-<C>M) directory,
# since nothing further happens to it in this session.
$pk7Fixture = New-GbdpFaultFixtureDir -Name 'PK7' -Slots $gbdpDerangement -Generation 1 `
  -Events @((New-GbdpDamageEvent -Target 2 -Value 7)) -WithMDir
New-GbdpFaultRow -Fixture $pk7Fixture -BuildExt 'P7' -FStatus 'CRASH' `
  -MExpect {
    param($Fixture, $Case)
    Assert-GbdpMFileBytes $Case 'R.GDJ' $Fixture.CommittedJournalBytes
    Assert-GbdpFlatState $Case.MDir $Fixture.Model $Fixture.Slots "$($Case.Name) <C>M"
  } `
  -FinalExpect {
    param($Fixture, $Case)
    Assert-GbdpBytesEqual ([IO.File]::ReadAllBytes((Join-Path $Case.Dir 'R.GDJ'))) $Fixture.CommittedJournalBytes "$($Case.Name) final R.GDJ"
    Assert-GbdpRealState $Case $Fixture.Model "$($Case.Name) final"
  }

# --- PK7C (7b, A4): the write-oracle CONTROL for PK7's session-2 mtime
# claim. Build P3 (PK3's own crash point): a genuine PREPARED .GDJ, every
# destination still preimage. Session 2 runs a real /D /J against it (no /R
# first), which auto-recovers (kind 4, restore is a no-op since destinations
# are already P) and re-produces fresh, applying once and committing -- a
# GENUINE write, so its mtimes moving proves the instrument that PK7's
# "unchanged" claim depends on is not simply blind.
$pk7cFixture = New-GbdpFaultFixtureDir -Name 'PK7C' -Slots $gbdpDerangement -Generation 1 `
  -Events @((New-GbdpDamageEvent -Target 2 -Value 7)) -WithMDir
New-GbdpFaultRow -Fixture $pk7cFixture -BuildExt 'P3' -FStatus 'CRASH' `
  -MExpect {
    param($Fixture, $Case)
    Assert-GbdpMFileBytes $Case 'R.GDJ' $Fixture.PreparedJournalBytes
    if (Test-Path (Join-Path $Case.MDir 'R.GDN')) { throw "$($Case.Name) <C>M: R.GDN unexpectedly present" }
    Assert-GbdpFlatState $Case.MDir @{ Gbpr = $Fixture.Gbpr; Sources = $Fixture.SourceP } $Fixture.Slots "$($Case.Name) <C>M"
  } `
  -FinalExpect {
    param($Fixture, $Case)
    Assert-GbdpBytesEqual ([IO.File]::ReadAllBytes((Join-Path $Case.Dir 'R.GDJ'))) $Fixture.PreparedJournalBytes "$($Case.Name) final R.GDJ"
    Assert-GbdpRealState $Case @{ Gbpr = $Fixture.Gbpr; Sources = $Fixture.SourceP } "$($Case.Name) final"
  }

# --- PF1: build PF1 (D_FAIL=1: commit write skip 40h, AX=2, CF set). A
# normal (non-crash) run to a real "incomplete" exit: the write pass already
# fully completed, so every destination is post, but the commit's write
# failed so the .GDJ stays PREPARED. ----------------------------------------
$pf1Fixture = New-GbdpFaultFixtureDir -Name 'PF1' -Slots $gbdpDerangement -Generation 1 `
  -Events @((New-GbdpDamageEvent -Target 2 -Value 7)) -WithMDir
New-GbdpFaultRow -Fixture $pf1Fixture -BuildExt 'PF1' -FStatus 'BAD' -FLog 'CCHOST: effect damage incomplete' `
  -MExpect {
    param($Fixture, $Case)
    Assert-GbdpMFileBytes $Case 'R.GDJ' $Fixture.PreparedJournalBytes
    Assert-GbdpFlatState $Case.MDir $Fixture.Model $Fixture.Slots "$($Case.Name) <C>M"
  } `
  -FollowUps @(
    @{ Command = "C:\CCHOST.COM /R $($pf1Fixture.RosterArg) $($pf1Fixture.SaveArg)"; ExpectedLog = 'CCHOST: effect damage recovered'; ExpectedStatus = 'OK' }
  ) `
  -FinalExpect {
    param($Fixture, $Case)
    Assert-GbdpFileAbsent $Case 'R.GDJ'  # plan §22.5 J.2: /R retired it
    Assert-GbdpRealState $Case @{ Gbpr = $Fixture.Gbpr; Sources = $Fixture.SourceP } "$($Case.Name) final"
  }

# --- PW1: build PW1 (D_SHORT=1: commit write with CX=1, so the state word's
# low byte on disk really does become 01 even though CCHOST's AX==2 length
# check fails it and reports "incomplete"). The .GDJ therefore reads as
# byte-identical to a fully COMMITTED journal (state word 0100h either way;
# amendment D.7 only ever touches that one word) even though the write pass
# reported failure -- so /R (and a hypothetical retry) must treat it as
# "already committed". -------------------------------------------------------
$pw1Fixture = New-GbdpFaultFixtureDir -Name 'PW1' -Slots $gbdpDerangement -Generation 1 `
  -Events @((New-GbdpDamageEvent -Target 2 -Value 7)) -WithMDir
New-GbdpFaultRow -Fixture $pw1Fixture -BuildExt 'PW1' -FStatus 'BAD' -FLog 'CCHOST: effect damage incomplete' `
  -MExpect {
    param($Fixture, $Case)
    Assert-GbdpMFileBytes $Case 'R.GDJ' $Fixture.CommittedJournalBytes
    Assert-GbdpFlatState $Case.MDir $Fixture.Model $Fixture.Slots "$($Case.Name) <C>M"
  } `
  -FollowUps @(
    @{ Command = "C:\CCHOST.COM /R $($pw1Fixture.RosterArg) $($pw1Fixture.SaveArg)"; ExpectedLog = 'CCHOST: effect damage already committed'; ExpectedStatus = 'OK' }
  ) `
  -FinalExpect {
    param($Fixture, $Case)
    Assert-GbdpBytesEqual ([IO.File]::ReadAllBytes((Join-Path $Case.Dir 'R.GDJ'))) $Fixture.CommittedJournalBytes "$($Case.Name) final R.GDJ"
    Assert-GbdpRealState $Case $Fixture.Model "$($Case.Name) final"
  }

# --- PL: the existing FAIL_DOK_SAVE_OPEN build, run with /J, one target
# (the DP01 shape). The destination CHRDATA open fails, so that member's
# GBPR HP/flags are already written (roster writes precede the source open
# per amendment F's write order) but its source file is never touched. -----
$plFixture = New-GbdpFaultFixtureDir -Name 'PL' -Slots $gbdpDerangement -Generation 1 `
  -Events @((New-GbdpDamageEvent -Target 2 -Value 7)) -WithMDir
New-GbdpFaultRow -Fixture $plFixture -BuildExt 'PL' -FStatus 'BAD' -FLog 'CCHOST: effect damage incomplete' `
  -MExpect {
    param($Fixture, $Case)
    Assert-GbdpMFileBytes $Case 'R.GDJ' $Fixture.PreparedJournalBytes
    Assert-GbdpFlatState $Case.MDir @{ Gbpr = $Fixture.Model.Gbpr; Sources = $Fixture.SourceP } $Fixture.Slots "$($Case.Name) <C>M"
  } `
  -FollowUps @(
    @{ Command = "C:\CCHOST.COM /R $($plFixture.RosterArg) $($plFixture.SaveArg)"; ExpectedLog = 'CCHOST: effect damage recovered'; ExpectedStatus = 'OK' }
  ) `
  -FinalExpect {
    param($Fixture, $Case)
    Assert-GbdpFileAbsent $Case 'R.GDJ'  # plan §22.5 J.2: /R retired it
    Assert-GbdpRealState $Case @{ Gbpr = $Fixture.Gbpr; Sources = $Fixture.SourceP } "$($Case.Name) final"
  }

# ============================================================================
# plan §22.5 J.1/J.2 -- new rows RN0, RN2, RN3, RRO, RRT (7c.1). None of
# these run a crash build: each fixture is written directly by PowerShell
# before DOSBox starts, so no <C>M/<C>P scratch directory is created and no
# name needs registering in $gbdpExcludedDirNames.
# ============================================================================

# --- RN0: no R.GDJ, no R.GDN at all (never produced). The simplest J.1
# case: /R on an ordinary, undamaged roster/save dir with no journal must
# report "journal absent" and touch nothing. --------------------------------
$rn0Dir = Join-Path $gbdpRun 'RN0'
$rn0SaveDir = Join-Path $rn0Dir 'SAVE'
New-Item -ItemType Directory -Force $rn0Dir | Out-Null
New-Item -ItemType Directory -Force $rn0SaveDir | Out-Null
$rn0RosterArg = 'C:\RN0\R.GPR'; $rn0SaveArg = 'C:\RN0\SAVE'
Assert-GbdpPathInside $rn0RosterArg 'RN0 roster'; Assert-GbdpPathInside $rn0SaveArg 'RN0 save dir'
$rn0Gbpr = New-GbdpRoster ([byte[]](3))
[IO.File]::WriteAllBytes((Join-Path $rn0Dir 'R.GPR'), $rn0Gbpr)
[IO.File]::WriteAllBytes((Join-Path $rn0SaveDir 'CHRDATA3.GAM'), (New-GbdrSlotPreimage 3))
$rn0 = @{
  Name = 'RN0'; Dir = $rn0Dir; SaveDir = $rn0SaveDir
  ExpectedLog = 'CCHOST: effect damage journal absent'; ExpectedStatus = 'OK'
  Commands = (New-GbdpCommandLines -Name 'RN0' -CdTarget 'RN0' -Command "C:\CCHOST.COM /R $rn0RosterArg $rn0SaveArg")
  Setup = 'RN0: no R.GDJ, no R.GDN -- /R must report absent with zero writes'
}
$rn0['Expect'] = { Invoke-GbdpZeroWriteExpect $rn0 }
$script:gbdpCases += ,$rn0
foreach ($line in $rn0.Commands) { [void]$script:gbdpBatch.AppendLine($line) }

# --- RN2: a stale .GDN survives from a produce that crashed before its
# .GDN -> .GDJ rename, and no .GDJ exists at all. Amendment J.1's own text:
# "no .GDJ means no torn destination, even when a stale .GDN exists. /R
# leaves that .GDN alone." Built directly (PK1/PK2's crash point, without
# running their crash builds) via -PreexistingGdnBytes. ---------------------
$rn2Events = @((New-GbdpDamageEvent -Target 2 -Value 7))
$rn2Fixture = New-GbdpFaultFixtureDir -Name 'RN2' -Slots $gbdpDerangement -Generation 1 -Events $rn2Events
$rn2GdnBytes = $rn2Fixture.PreparedJournalBytes
[IO.File]::WriteAllBytes((Join-Path $rn2Fixture.Dir 'R.GDN'), $rn2GdnBytes)
$rn2 = @{
  Name = 'RN2'; Dir = $rn2Fixture.Dir; SaveDir = $rn2Fixture.SaveDir
  Fixture = @{ Slots = $rn2Fixture.Slots }
  ExpectedLog = 'CCHOST: effect damage journal absent'; ExpectedStatus = 'OK'
  Commands = (New-GbdpCommandLines -Name 'RN2' -CdTarget 'RN2' -Command "C:\CCHOST.COM /R $($rn2Fixture.RosterArg) $($rn2Fixture.SaveArg)")
  Setup = 'RN2: stale .GDN present, no .GDJ -- /R must report absent and leave the .GDN alone'
}
$rn2['Expect'] = {
  Invoke-GbdpZeroWriteExpect $rn2
  Assert-GbdpBytesEqual ([IO.File]::ReadAllBytes((Join-Path $rn2Fixture.Dir 'R.GDN'))) $rn2GdnBytes 'RN2 final R.GDN'
}
$script:gbdpCases += ,$rn2
foreach ($line in $rn2.Commands) { [void]$script:gbdpBatch.AppendLine($line) }

# --- RN3: the roster's DIRECTORY does not exist at all (not merely a
# missing .GDJ within an existing directory). This discriminates J.1's
# `cmp ax,2` gate: a conventional DOS/DOSBox open of a path whose directory
# component does not exist answers AX=3 (path not found), not AX=2 (file
# not found), so this row must NOT report "journal absent" -- it must fall
# through to the ordinary (result)/BAD path, exactly as any other
# non-absent open failure does. If DOSBox instead answers AX=2 here too,
# J.1's gate cannot tell the two apart; per the standing brief that is a
# real discrimination gap to report, not something this row may be
# weakened to accept. --------------------------------------------------------
$rn3RosterArg = 'C:\RN3\R.GPR'; $rn3SaveArg = 'C:\RN3\SAVE'
Assert-GbdpPathInside $rn3RosterArg 'RN3 roster'; Assert-GbdpPathInside $rn3SaveArg 'RN3 save dir'
$rn3 = @{
  # RN3's directory is deliberately never created (that is the point of the
  # row); this path is still given so the shared "no .GDN survived" sweep
  # below (Join-Path $c.Dir 'R.GDN') has a non-null Dir to test against --
  # Test-Path on a nonexistent path returns $false harmlessly.
  Name = 'RN3'; Dir = (Join-Path $gbdpRun 'RN3')
  ExpectedLog = 'CCHOST: invalid host request (result)'; ExpectedStatus = 'BAD'
  Commands = (New-GbdpCommandLines -Name 'RN3' -CdTarget $null -Command "C:\CCHOST.COM /R $rn3RosterArg $rn3SaveArg")
  Setup = 'RN3: roster directory does not exist at all -- discriminates AX=2 vs AX=3 for J.1'
}
$rn3['Expect'] = {
  $r = Get-GbdpFaultStepOutcome 'RN3'
  if ($r.Log -eq 'CCHOST: effect damage journal absent' -and $r.Status -eq 'OK') {
    throw "RN3: STOP-AND-REPORT -- a nonexistent roster directory was reported as 'journal absent' (AX=2), which J.1's cmp ax,2 gate cannot distinguish from a genuinely absent .GDJ in an existing directory. This is a real discrimination gap in J.1, not a test bug; do not weaken this row to accept it."
  }
  if ($r.Log -ne $rn3.ExpectedLog -or $r.Status -ne $rn3.ExpectedStatus) {
    throw "RN3: expected log '$($rn3.ExpectedLog)' status '$($rn3.ExpectedStatus)', got log '$($r.Log)' status '$($r.Status)'"
  }
  if (Test-Path (Join-Path $gbdpRun 'RN3')) { throw 'RN3: a directory was unexpectedly created for a path that was never provisioned' }
}
$script:gbdpCases += ,$rn3
foreach ($line in $rn3.Commands) { [void]$script:gbdpBatch.AppendLine($line) }

# --- RRO: PK6's crash point ("every destination fully post, .GDJ still
# PREPARED") built directly (no crash-build run) so R.GDJ's read-only
# attribute can be set BEFORE DOSBox starts, mirroring DR12's own
# host-side-fixture technique rather than PK6's live-crash-build one. /R
# performs a real, successful restore (destinations -> P), but the
# retire's delete then fails against the host-read-only file; DOSBox maps
# that failed unlink to AX=2 (§16.3 mapping already relied on elsewhere in
# this harness), so the retire's own re-open succeeds and CCHOST correctly
# reports "recovered, journal not retired" rather than silently losing the
# failure. -------------------------------------------------------------------
$rroEvents = @((New-GbdpDamageEvent -Target 2 -Value 7))
$rroFixture = New-GbdpFaultFixtureDir -Name 'RRO' -Slots $gbdpDerangement -Generation 1 -Events $rroEvents
[IO.File]::WriteAllBytes((Join-Path $rroFixture.Dir 'R.GPR'), $rroFixture.Model.Gbpr)
foreach ($ord in $rroFixture.Model.Sources.Keys) {
  $slot = $rroFixture.Slots[$ord]
  [IO.File]::WriteAllBytes((Join-Path $rroFixture.SaveDir "CHRDATA$slot.GAM"), $rroFixture.Model.Sources[$ord])
}
[IO.File]::WriteAllBytes((Join-Path $rroFixture.Dir 'R.GDJ'), $rroFixture.PreparedJournalBytes)
$rroGdjPath = Join-Path $rroFixture.Dir 'R.GDJ'
Set-ItemProperty -Path $rroGdjPath -Name IsReadOnly -Value $true
$script:gbdpReadOnlyFiles += $rroGdjPath
$rro = @{
  Name = 'RRO'; Dir = $rroFixture.Dir; SaveDir = $rroFixture.SaveDir
  Fixture = @{ Slots = $rroFixture.Slots }
  ExpectedLog = 'CCHOST: effect damage recovered, journal not retired'; ExpectedStatus = 'BAD'
  Commands = (New-GbdpCommandLines -Name 'RRO' -CdTarget 'RRO' -Command "C:\CCHOST.COM /R $($rroFixture.RosterArg) $($rroFixture.SaveArg)")
  Setup = 'RRO: host-read-only R.GDJ -- successful restore, retire delete fails, journal not retired'
}
$rro['Expect'] = {
  Assert-GbdpFaultStepOutcome 'RRO' $rro.ExpectedLog $rro.ExpectedStatus
  Assert-GbdpRealState $rro @{ Gbpr = $rroFixture.Gbpr; Sources = $rroFixture.SourceP } 'RRO final'
  Assert-GbdpBytesEqual ([IO.File]::ReadAllBytes($rroGdjPath)) $rroFixture.PreparedJournalBytes 'RRO final R.GDJ'
}
$script:gbdpCases += ,$rro
foreach ($line in $rro.Commands) { [void]$script:gbdpBatch.AppendLine($line) }

# --- RRT: the plan's "step-9 happy path end to end" -- /R restores and
# retires (RRT_R1: "recovered"), a second /R then reports absent (RRT_R2:
# "journal absent"), and a fresh /D /J applies the event exactly once from
# that retired-to-P state and commits (RRT_R3: "applied"). Same PK6-shape
# base as RRO, built the same way, but with no read-only attribute. --------
$rrtEvents = @((New-GbdpDamageEvent -Target 2 -Value 7))
$rrtFixture = New-GbdpFaultFixtureDir -Name 'RRT' -Slots $gbdpDerangement -Generation 1 -Events $rrtEvents
[IO.File]::WriteAllBytes((Join-Path $rrtFixture.Dir 'R.GPR'), $rrtFixture.Model.Gbpr)
foreach ($ord in $rrtFixture.Model.Sources.Keys) {
  $slot = $rrtFixture.Slots[$ord]
  [IO.File]::WriteAllBytes((Join-Path $rrtFixture.SaveDir "CHRDATA$slot.GAM"), $rrtFixture.Model.Sources[$ord])
}
[IO.File]::WriteAllBytes((Join-Path $rrtFixture.Dir 'R.GDJ'), $rrtFixture.PreparedJournalBytes)
$rrtLines = New-Object System.Collections.Generic.List[string]
$rrtLines.AddRange((New-GbdpCommandLines -Name 'RRT_R1' -CdTarget 'RRT' -Command "C:\CCHOST.COM /R $($rrtFixture.RosterArg) $($rrtFixture.SaveArg)"))
$rrtLines.AddRange((New-GbdpCommandLines -Name 'RRT_R2' -CdTarget 'RRT' -Command "C:\CCHOST.COM /R $($rrtFixture.RosterArg) $($rrtFixture.SaveArg)"))
$rrtLines.AddRange((New-GbdpCommandLines -Name 'RRT_R3' -CdTarget 'RRT' -Command "C:\CCHOST.COM /D $($rrtFixture.EffectArg) $($rrtFixture.RosterArg) /J"))
$rrt = @{
  Name = 'RRT'; Dir = $rrtFixture.Dir; SaveDir = $rrtFixture.SaveDir
  Fixture = @{ Slots = $rrtFixture.Slots }
  Commands = $rrtLines.ToArray()
  Setup = 'RRT: /R retires, /R again reports absent, then /D /J applies fresh and commits'
}
$rrt['Expect'] = {
  Assert-GbdpFaultStepOutcome 'RRT_R1' 'CCHOST: effect damage recovered' 'OK'
  Assert-GbdpFaultStepOutcome 'RRT_R2' 'CCHOST: effect damage journal absent' 'OK'
  Assert-GbdpFaultStepOutcome 'RRT_R3' 'CCHOST: effect damage applied' 'OK'
  Assert-GbdpRealState $rrt $rrtFixture.Model 'RRT final'
  Assert-GbdpBytesEqual ([IO.File]::ReadAllBytes((Join-Path $rrtFixture.Dir 'R.GDJ'))) $rrtFixture.CommittedJournalBytes 'RRT final R.GDJ'
}
$script:gbdpCases += ,$rrt
foreach ($line in $rrt.Commands) { [void]$script:gbdpBatch.AppendLine($line) }

# --- PF2: build PF2 (D_FAIL=2: first .GDN write skip 40h, AX=requested
# length, CF set -- the corrected hook shape from checkpoint 5 section 14.2,
# so only the CF check can reject it). Fails during produce, before any
# rename or write pass: (result), zero writes, no .GDN/.GDJ survive. -------
$pf2Fixture = New-GbdpFaultFixtureDir -Name 'PF2' -Slots $gbdpDerangement -Generation 1 `
  -Events @((New-GbdpDamageEvent -Target 2 -Value 7))
New-GbdpFaultZeroWriteRow -Fixture $pf2Fixture -BuildExt 'PF2' -ExpectedLog 'CCHOST: invalid host request (result)' -GdnCreatedThenDeleted

# --- PW2: build PW2 (D_SHORT=2: first .GDN write with CX=length-1). Same
# shape as PF2: the AX==length check fails the truncated write. ------------
$pw2Fixture = New-GbdpFaultFixtureDir -Name 'PW2' -Slots $gbdpDerangement -Generation 1 `
  -Events @((New-GbdpDamageEvent -Target 2 -Value 7))
New-GbdpFaultZeroWriteRow -Fixture $pw2Fixture -BuildExt 'PW2' -ExpectedLog 'CCHOST: invalid host request (result)' -GdnCreatedThenDeleted

# --- PV: build PV (D_CORRUPT=1: before the .GDN close, seek to 16 and
# write word 3 into the flags field). The self-verify (G-checks in
# validate-only mode) rejects flags != 1 and deletes the .GDN: same shape
# as PF2. ---------------------------------------------------------------
$pvFixture = New-GbdpFaultFixtureDir -Name 'PV' -Slots $gbdpDerangement -Generation 1 `
  -Events @((New-GbdpDamageEvent -Target 2 -Value 7))
New-GbdpFaultZeroWriteRow -Fixture $pvFixture -BuildExt 'PV' -ExpectedLog 'CCHOST: invalid host request (result)' -GdnCreatedThenDeleted

# --- PG: build PG (D_FAIL=3, the new D4 hook from checkpoint 7 section
# 16.3: in damage_journal_delete_stale_gdn, 41h is skipped and AX=5/CF set
# is returned, since DOSBox cannot itself produce a non-"file not found"
# 41h failure). A writable stale 10-byte R.GDN of 0xAA must survive the run
# byte- and mtime-unchanged: this is D4's only witness. ---------------------
$pgStaleGdn = New-Object byte[] 10
for ($i = 0; $i -lt 10; $i++) { $pgStaleGdn[$i] = 0xAA }
$pgFixture = New-GbdpFaultFixtureDir -Name 'PG' -Slots $gbdpDerangement -Generation 1 `
  -Events @((New-GbdpDamageEvent -Target 2 -Value 7)) -PreexistingGdnBytes $pgStaleGdn
New-GbdpFaultZeroWriteRow -Fixture $pgFixture -BuildExt 'PG' -ExpectedLog 'CCHOST: invalid host request (result)'

# --- 7b (amendment I: kind-4 auto-recover) new fault-half rows -------------
# PK3D/PK4D/PK5D/PK6D/PF1D: "Direct" retries -- the SAME crash point as
# PK3/PK4/PK5/PK6/PF1 respectively, but in a sibling fixture (own <C>M), and
# the ONLY follow-up is a /D /J retry with NO /R first. By CRASH_AT ordering
# (1<2<3<4<5<6<7), CRASH_AT=3/4/5/6 and D_FAIL=1 all fire AFTER the PREPARED
# rename, so each of these already carries a genuine self-produced PREPARED
# .GDJ at crash time whose +32 matches this same request -- kind 4, not kind
# 1 -- so the retry must auto-recover (restore first, undoing whatever
# partial damage the crash left, THEN re-produce fresh) even with no /R ever
# having run. JB1's predicted mutation (kind 4 wrongly treated as replaceable,
# skipping the recover call) would double-damage PK4D's ordinal 0 instead of
# restoring it first; JB5's targets PK6D's fully-post PREPARED shape the same
# way.
$pk3dFixture = New-GbdpFaultFixtureDir -Name 'PK3D' -Slots $gbdpDerangement -Generation 1 `
  -Events @((New-GbdpDamageEvent -Target 2 -Value 7)) -WithMDir
New-GbdpFaultRow -Fixture $pk3dFixture -BuildExt 'P3' -FStatus 'CRASH' `
  -MExpect {
    param($Fixture, $Case)
    Assert-GbdpMFileBytes $Case 'R.GDJ' $Fixture.PreparedJournalBytes
    if (Test-Path (Join-Path $Case.MDir 'R.GDN')) { throw "$($Case.Name) <C>M: R.GDN unexpectedly present" }
    Assert-GbdpFlatState $Case.MDir @{ Gbpr = $Fixture.Gbpr; Sources = $Fixture.SourceP } $Fixture.Slots "$($Case.Name) <C>M"
  } `
  -FollowUps @(
    @{ Command = "C:\CCHOST.COM /D $($pk3dFixture.EffectArg) $($pk3dFixture.RosterArg) /J"; ExpectedLog = 'CCHOST: effect damage applied'; ExpectedStatus = 'OK' }
  ) `
  -FinalExpect {
    param($Fixture, $Case)
    Assert-GbdpBytesEqual ([IO.File]::ReadAllBytes((Join-Path $Case.Dir 'R.GDJ'))) $Fixture.CommittedJournalBytes "$($Case.Name) final R.GDJ"
    Assert-GbdpRealState $Case $Fixture.Model "$($Case.Name) final"
  }

$pk4dFixture = New-GbdpFaultFixtureDir -Name 'PK4D' -Slots $gbdpDerangement -Generation 1 `
  -Events @((New-GbdpDamageEvent -AllTarget -Value 7)) -WithMDir
New-GbdpFaultRow -Fixture $pk4dFixture -BuildExt 'P4' -FStatus 'CRASH' `
  -MExpect {
    param($Fixture, $Case)
    $partial = Get-GbdpCrash4Model -Gbpr $Fixture.Gbpr -Sources $Fixture.SourceP -Events $Fixture.Events
    Assert-GbdpFlatState $Case.MDir $partial $Fixture.Slots "$($Case.Name) <C>M"
  } `
  -FollowUps @(
    @{ Command = "C:\CCHOST.COM /D $($pk4dFixture.EffectArg) $($pk4dFixture.RosterArg) /J"; ExpectedLog = 'CCHOST: effect damage applied'; ExpectedStatus = 'OK' }
  ) `
  -FinalExpect {
    param($Fixture, $Case)
    Assert-GbdpBytesEqual ([IO.File]::ReadAllBytes((Join-Path $Case.Dir 'R.GDJ'))) $Fixture.CommittedJournalBytes "$($Case.Name) final R.GDJ"
    Assert-GbdpRealState $Case $Fixture.Model "$($Case.Name) final"
  }

$pk5dFixture = New-GbdpFaultFixtureDir -Name 'PK5D' -Slots $gbdpDerangement -Generation 1 -Events $pk5Events -WithMDir
New-GbdpFaultRow -Fixture $pk5dFixture -BuildExt 'P5' -FStatus 'CRASH' `
  -MExpect {
    param($Fixture, $Case)
    $partial = Get-GbdpModelPost -Gbpr $Fixture.Gbpr -Sources $Fixture.SourceP -Events @($Fixture.Events[0])
    Assert-GbdpFlatState $Case.MDir $partial $Fixture.Slots "$($Case.Name) <C>M"
  } `
  -FollowUps @(
    @{ Command = "C:\CCHOST.COM /D $($pk5dFixture.EffectArg) $($pk5dFixture.RosterArg) /J"; ExpectedLog = 'CCHOST: effect damage applied'; ExpectedStatus = 'OK' }
  ) `
  -FinalExpect {
    param($Fixture, $Case)
    Assert-GbdpBytesEqual ([IO.File]::ReadAllBytes((Join-Path $Case.Dir 'R.GDJ'))) $Fixture.CommittedJournalBytes "$($Case.Name) final R.GDJ"
    Assert-GbdpRealState $Case $Fixture.Model "$($Case.Name) final"
  }

$pk6dFixture = New-GbdpFaultFixtureDir -Name 'PK6D' -Slots $gbdpDerangement -Generation 1 `
  -Events @((New-GbdpDamageEvent -Target 2 -Value 7)) -WithMDir
New-GbdpFaultRow -Fixture $pk6dFixture -BuildExt 'P6' -FStatus 'CRASH' `
  -MExpect {
    param($Fixture, $Case)
    Assert-GbdpMFileBytes $Case 'R.GDJ' $Fixture.PreparedJournalBytes
    Assert-GbdpFlatState $Case.MDir $Fixture.Model $Fixture.Slots "$($Case.Name) <C>M"
  } `
  -FollowUps @(
    @{ Command = "C:\CCHOST.COM /D $($pk6dFixture.EffectArg) $($pk6dFixture.RosterArg) /J"; ExpectedLog = 'CCHOST: effect damage applied'; ExpectedStatus = 'OK' }
  ) `
  -FinalExpect {
    param($Fixture, $Case)
    Assert-GbdpBytesEqual ([IO.File]::ReadAllBytes((Join-Path $Case.Dir 'R.GDJ'))) $Fixture.CommittedJournalBytes "$($Case.Name) final R.GDJ"
    Assert-GbdpRealState $Case $Fixture.Model "$($Case.Name) final"
  }

$pf1dFixture = New-GbdpFaultFixtureDir -Name 'PF1D' -Slots $gbdpDerangement -Generation 1 `
  -Events @((New-GbdpDamageEvent -Target 2 -Value 7)) -WithMDir
New-GbdpFaultRow -Fixture $pf1dFixture -BuildExt 'PF1' -FStatus 'BAD' -FLog 'CCHOST: effect damage incomplete' `
  -MExpect {
    param($Fixture, $Case)
    Assert-GbdpMFileBytes $Case 'R.GDJ' $Fixture.PreparedJournalBytes
    Assert-GbdpFlatState $Case.MDir $Fixture.Model $Fixture.Slots "$($Case.Name) <C>M"
  } `
  -FollowUps @(
    @{ Command = "C:\CCHOST.COM /D $($pf1dFixture.EffectArg) $($pf1dFixture.RosterArg) /J"; ExpectedLog = 'CCHOST: effect damage applied'; ExpectedStatus = 'OK' }
  ) `
  -FinalExpect {
    param($Fixture, $Case)
    Assert-GbdpBytesEqual ([IO.File]::ReadAllBytes((Join-Path $Case.Dir 'R.GDJ'))) $Fixture.CommittedJournalBytes "$($Case.Name) final R.GDJ"
    Assert-GbdpRealState $Case $Fixture.Model "$($Case.Name) final"
  }

# PKR: build P6 (own instance, own <C>M): a genuine fully-post PREPARED
# journal. The PROBE is build RK1 -- the restore routine's OWN existing
# CRASH_AT=1 hook (already proven against GBDR's own RK1 case in this same
# file), now reached via the auto-recover call's restore step instead of a
# direct /R -- which tears the restore after unit 0 (the roster) but before
# any member source, leaving roster=P (restored) and every source still
# post. A normal production /D /J retry then completes the interrupted
# recovery and applies fresh exactly once.
$pkrFixture = New-GbdpFaultFixtureDir -Name 'PKR' -Slots $gbdpDerangement -Generation 1 `
  -Events @((New-GbdpDamageEvent -Target 2 -Value 7)) -WithMDir
New-GbdpFaultRow -Fixture $pkrFixture -BuildExt 'P6' -FStatus 'CRASH' `
  -MExpect {
    param($Fixture, $Case)
    Assert-GbdpMFileBytes $Case 'R.GDJ' $Fixture.PreparedJournalBytes
    Assert-GbdpFlatState $Case.MDir $Fixture.Model $Fixture.Slots "$($Case.Name) <C>M"
  } `
  -ProbeBuildExt 'RK1' -ProbeCommand "C:\CCHOST.COM /D $($pkrFixture.EffectArg) $($pkrFixture.RosterArg) /J" `
  -ProbeExpectedStatus 'CRASH' `
  -ProbeExpect {
    param($Fixture, $Case)
    Assert-GbdpFlatState $Case.ProbeDir @{ Gbpr = $Fixture.Gbpr; Sources = $Fixture.Model.Sources } $Fixture.Slots "$($Case.Name) probe (roster=P, sources=post)"
    Assert-GbdpBytesEqual ([IO.File]::ReadAllBytes((Join-Path $Case.ProbeDir 'R.GDJ'))) $Fixture.PreparedJournalBytes "$($Case.Name) probe R.GDJ"
  } `
  -FollowUps @(
    @{ Command = "C:\CCHOST.COM /D $($pkrFixture.EffectArg) $($pkrFixture.RosterArg) /J"; ExpectedLog = 'CCHOST: effect damage applied'; ExpectedStatus = 'OK' }
  ) `
  -FinalExpect {
    param($Fixture, $Case)
    Assert-GbdpBytesEqual ([IO.File]::ReadAllBytes((Join-Path $Case.Dir 'R.GDJ'))) $Fixture.CommittedJournalBytes "$($Case.Name) final R.GDJ"
    Assert-GbdpRealState $Case $Fixture.Model "$($Case.Name) final"
  }

# PKF: build P6 (own instance, own <C>M): same fully-post PREPARED journal.
# The PROBE is build RF0 -- the restore routine's OWN existing FAIL_AT=0
# hook (already proven against GBDR's own RF0 case), which fails the
# recover call's restore at its very FIRST write (nothing touched at all),
# so it must report "recovery incomplete" and leave every destination still
# fully post and R.GDJ still PREPARED. A normal production /D /J retry then
# completes the recovery and applies fresh exactly once.
$pkfFixture = New-GbdpFaultFixtureDir -Name 'PKF' -Slots $gbdpDerangement -Generation 1 `
  -Events @((New-GbdpDamageEvent -Target 2 -Value 7)) -WithMDir
New-GbdpFaultRow -Fixture $pkfFixture -BuildExt 'P6' -FStatus 'CRASH' `
  -MExpect {
    param($Fixture, $Case)
    Assert-GbdpMFileBytes $Case 'R.GDJ' $Fixture.PreparedJournalBytes
    Assert-GbdpFlatState $Case.MDir $Fixture.Model $Fixture.Slots "$($Case.Name) <C>M"
  } `
  -ProbeBuildExt 'RF0' -ProbeCommand "C:\CCHOST.COM /D $($pkfFixture.EffectArg) $($pkfFixture.RosterArg) /J" `
  -ProbeExpectedLog 'CCHOST: effect damage recovery incomplete' -ProbeExpectedStatus 'BAD' `
  -ProbeExpect {
    param($Fixture, $Case)
    Assert-GbdpFlatState $Case.ProbeDir $Fixture.Model $Fixture.Slots "$($Case.Name) probe (all destinations still post)"
    Assert-GbdpBytesEqual ([IO.File]::ReadAllBytes((Join-Path $Case.ProbeDir 'R.GDJ'))) $Fixture.PreparedJournalBytes "$($Case.Name) probe R.GDJ"
  } `
  -FollowUps @(
    @{ Command = "C:\CCHOST.COM /D $($pkfFixture.EffectArg) $($pkfFixture.RosterArg) /J"; ExpectedLog = 'CCHOST: effect damage applied'; ExpectedStatus = 'OK' }
  ) `
  -FinalExpect {
    param($Fixture, $Case)
    Assert-GbdpBytesEqual ([IO.File]::ReadAllBytes((Join-Path $Case.Dir 'R.GDJ'))) $Fixture.CommittedJournalBytes "$($Case.Name) final R.GDJ"
    Assert-GbdpRealState $Case $Fixture.Model "$($Case.Name) final"
  }

# DRH8: a genuine self-produced PREPARED journal touching all SIX roster
# members (mask 0x3F -- $gbdpDerangement already has six slots, the same
# six-source shape as GBDR's own GR8/RH8 fixture), run under build PH8
# (HOLD_HANDLES=8, no ACCEPT_MARK -- production dispatch plus K held NUL
# handles across the auto-recover call). Proves the auto-recover call's own
# peak handle usage (5 standard + 8 held + up to 7 retained = 20) still fits
# the DOS budget; JB3's predicted mutation (holding the effect-file handle
# open across the recover call) pushes the peak to 21 and is witnessed here
# via "recovery target unavailable" instead of "applied".
$drh8Slots = $gbdpDerangement
$drh8Events = @((New-GbdpDamageEvent -AllTarget -Value 7))
$drh8Gbpr = New-GbdpRoster $drh8Slots
$drh8SourceP = New-GbdpSourceMap $drh8Slots
$drh8Mask = Get-GbdpModelMask -Gbpr $drh8Gbpr -Events $drh8Events
$drh8Model = Get-GbdpModelPost -Gbpr $drh8Gbpr -Sources $drh8SourceP -Events $drh8Events
$drh8EffectBytes = New-GbdpEffectBytes -Version 14 -Events $drh8Events
$drh8Journal = New-GbdpExpectedJournalState -BasePath 'C:\DRH8' -Gbpr $drh8Gbpr -SourceP $drh8SourceP `
  -Generation 1 -Mask $drh8Mask -EffectExtent 5920 -EffectBytes $drh8EffectBytes -State 0
$drh8CommittedJournal = New-GbdpExpectedJournal -BasePath 'C:\DRH8' -Gbpr $drh8Gbpr -SourceP $drh8SourceP `
  -Generation 1 -Mask $drh8Mask -EffectExtent 5920 -EffectBytes $drh8EffectBytes

$drh8Dir = Join-Path $gbdpRun 'DRH8'
$drh8SaveDir = Join-Path $drh8Dir 'SAVE'
New-Item -ItemType Directory -Force $drh8Dir | Out-Null
New-Item -ItemType Directory -Force $drh8SaveDir | Out-Null
$drh8RosterArg = 'C:\DRH8\R.GPR'; $drh8SaveArg = 'C:\DRH8\SAVE'
$drh8TokenArg = 'C:\DRH8\E.DOP'; $drh8EffectArg = 'C:\DRH8\E.EFX'
Assert-GbdpPathInside $drh8RosterArg 'DRH8 roster'; Assert-GbdpPathInside $drh8SaveArg 'DRH8 save dir'
Assert-GbdpPathInside $drh8TokenArg 'DRH8 token'; Assert-GbdpPathInside $drh8EffectArg 'DRH8 effect'
[IO.File]::WriteAllBytes((Join-Path $drh8Dir 'R.GPR'), $drh8Model.Gbpr)
foreach ($ord in $drh8Model.Sources.Keys) {
  [IO.File]::WriteAllBytes((Join-Path $drh8SaveDir "CHRDATA$($drh8Slots[$ord]).GAM"), $drh8Model.Sources[$ord])
}
[IO.File]::WriteAllBytes((Join-Path $drh8Dir 'E.DOP'), (New-OperationToken 1))
[IO.File]::WriteAllBytes((Join-Path $drh8Dir 'E.EFX'), $drh8EffectBytes)
[IO.File]::WriteAllBytes((Join-Path $drh8Dir 'R.GDJ'), $drh8Journal)

$drh8Lines = New-Object System.Collections.Generic.List[string]
[void]$drh8Lines.Add('copy C:\CCHOST.PH8 C:\CCHOST.COM > nul')
$drh8Lines.AddRange((New-GbdpCommandLines -Name 'DRH8' -CdTarget 'DRH8' -Command "C:\CCHOST.COM /D $drh8EffectArg $drh8RosterArg /J"))
[void]$drh8Lines.Add('copy C:\CCHOST.RJP C:\CCHOST.COM > nul')

$drh8Case = @{
  Name = 'DRH8'; Dir = $drh8Dir; SaveDir = $drh8SaveDir
  Gbpr = $drh8Gbpr; SourceP = $drh8SourceP; Slots = $drh8Slots; Generation = 1
  Mask = $drh8Mask; Model = $drh8Model; ForeignFiles = @{}
  ExpectedJournalBytes = $drh8CommittedJournal
  ExpectedLog = 'CCHOST: effect damage applied'; ExpectedStatus = 'OK'
  Commands = $drh8Lines.ToArray()
  Setup = 'six-member all-target PREPARED journal (mask 0x3F) under PH8 (HOLD_HANDLES=8): peak = 5 + 8 + 7 = 20'
}
$drh8Case['Expect'] = { Invoke-GbdpDamageExpect $drh8Case }
$script:gbdpCases += ,$drh8Case
foreach ($line in $drh8Case.Commands) { [void]$script:gbdpBatch.AppendLine($line) }

# ============================================================================
# plan §27.5 amendment K (9a) -- RD0, RD1, RD1T, RD2. Amendment K lets
# "CCHOST /R <roster>" (exactly one argument) derive the save directory via
# damage_journal_derive_save_dir instead of requiring a caller-supplied
# second argument. These four rows are host-side fixtures (no crash build
# run), the same technique RN0/RN2/RN3/RRO/RRT above already use.
# ============================================================================

# --- RD0: cd into the case dir, then a one-argument /R on an ordinary,
# undamaged roster/save dir with no journal at all -- the amendment-K analog
# of RN0. Must report "journal absent" with zero writes. ---------------------
$rd0Dir = Join-Path $gbdpRun 'RD0'
$rd0SaveDir = Join-Path $rd0Dir 'SAVE'
New-Item -ItemType Directory -Force $rd0Dir | Out-Null
New-Item -ItemType Directory -Force $rd0SaveDir | Out-Null
$rd0RosterArg = 'C:\RD0\R.GPR'
Assert-GbdpPathInside $rd0RosterArg 'RD0 roster'
$rd0Gbpr = New-GbdpRoster ([byte[]](3))
[IO.File]::WriteAllBytes((Join-Path $rd0Dir 'R.GPR'), $rd0Gbpr)
[IO.File]::WriteAllBytes((Join-Path $rd0SaveDir 'CHRDATA3.GAM'), (New-GbdrSlotPreimage 3))
$rd0 = @{
  Name = 'RD0'; Dir = $rd0Dir; SaveDir = $rd0SaveDir
  ExpectedLog = 'CCHOST: effect damage journal absent'; ExpectedStatus = 'OK'
  Commands = (New-GbdpCommandLines -Name 'RD0' -CdTarget 'RD0' -Command "C:\CCHOST.COM /R $rd0RosterArg")
  Setup = 'RD0: one-argument /R, no R.GDJ/R.GDN at all -- must report absent with zero writes'
}
$rd0['Expect'] = { Invoke-GbdpZeroWriteExpect $rd0 }
$script:gbdpCases += ,$rd0
foreach ($line in $rd0.Commands) { [void]$script:gbdpBatch.AppendLine($line) }

# --- RD1: the PK6-shape crash state (every destination fully post, .GDJ
# still PREPARED), built the RRO/RRT host-side way with BasePath "C:\RD1" so
# the journal's recorded source-dir field (+368) is exactly "C:\RD1\SAVE".
# The one-argument /R below runs with the case dir as the current directory
# (New-GbdpCommandLines' own "cd \RD1" / "cd \" bracketing), so
# damage_journal_derive_save_dir computes that same "C:\RD1\SAVE" and the
# G2 match succeeds: a real restore, then a retire. -------------------------
$rd1Events = @((New-GbdpDamageEvent -Target 2 -Value 7))
$rd1Fixture = New-GbdpFaultFixtureDir -Name 'RD1' -Slots $gbdpDerangement -Generation 1 -Events $rd1Events
[IO.File]::WriteAllBytes((Join-Path $rd1Fixture.Dir 'R.GPR'), $rd1Fixture.Model.Gbpr)
foreach ($ord in $rd1Fixture.Model.Sources.Keys) {
  $slot = $rd1Fixture.Slots[$ord]
  [IO.File]::WriteAllBytes((Join-Path $rd1Fixture.SaveDir "CHRDATA$slot.GAM"), $rd1Fixture.Model.Sources[$ord])
}
[IO.File]::WriteAllBytes((Join-Path $rd1Fixture.Dir 'R.GDJ'), $rd1Fixture.PreparedJournalBytes)
$rd1 = @{
  Name = 'RD1'; Dir = $rd1Fixture.Dir; SaveDir = $rd1Fixture.SaveDir
  Fixture = @{ Slots = $rd1Fixture.Slots }
  ExpectedLog = 'CCHOST: effect damage recovered'; ExpectedStatus = 'OK'
  Commands = (New-GbdpCommandLines -Name 'RD1' -CdTarget 'RD1' -Command "C:\CCHOST.COM /R $($rd1Fixture.RosterArg)")
  Setup = 'RD1: one-argument /R run from C:\RD1 derives C:\RD1\SAVE, matching the PK6-shape journal -- recovered, destinations = P, R.GDJ retired'
}
$rd1['Expect'] = {
  Assert-GbdpFaultStepOutcome 'RD1' $rd1.ExpectedLog $rd1.ExpectedStatus
  Assert-GbdpRealState $rd1 @{ Gbpr = $rd1Fixture.Gbpr; Sources = $rd1Fixture.SourceP } 'RD1 final'
  Assert-GbdpFileAbsent $rd1 'R.GDJ'
}
$script:gbdpCases += ,$rd1
foreach ($line in $rd1.Commands) { [void]$script:gbdpBatch.AppendLine($line) }

# --- RD1T: an IDENTICAL fixture (same Slots/Generation/Events, so the same
# Gbpr/sources bytes -- neither embeds a path or the case name), but run
# with the existing TWO-argument /R form instead. Control for RD1: the
# derived and explicit forms must reach the same final state. ---------------
$rd1tFixture = New-GbdpFaultFixtureDir -Name 'RD1T' -Slots $gbdpDerangement -Generation 1 -Events $rd1Events
[IO.File]::WriteAllBytes((Join-Path $rd1tFixture.Dir 'R.GPR'), $rd1tFixture.Model.Gbpr)
foreach ($ord in $rd1tFixture.Model.Sources.Keys) {
  $slot = $rd1tFixture.Slots[$ord]
  [IO.File]::WriteAllBytes((Join-Path $rd1tFixture.SaveDir "CHRDATA$slot.GAM"), $rd1tFixture.Model.Sources[$ord])
}
[IO.File]::WriteAllBytes((Join-Path $rd1tFixture.Dir 'R.GDJ'), $rd1tFixture.PreparedJournalBytes)
$rd1t = @{
  Name = 'RD1T'; Dir = $rd1tFixture.Dir; SaveDir = $rd1tFixture.SaveDir
  Fixture = @{ Slots = $rd1tFixture.Slots }
  ExpectedLog = 'CCHOST: effect damage recovered'; ExpectedStatus = 'OK'
  Commands = (New-GbdpCommandLines -Name 'RD1T' -CdTarget 'RD1T' -Command "C:\CCHOST.COM /R $($rd1tFixture.RosterArg) $($rd1tFixture.SaveArg)")
  Setup = 'RD1T: identical PK6-shape fixture, two-argument /R C:\RD1T\R.GPR C:\RD1T\SAVE -- control for RD1'
}
$rd1t['Expect'] = {
  Assert-GbdpFaultStepOutcome 'RD1T' $rd1t.ExpectedLog $rd1t.ExpectedStatus
  Assert-GbdpRealState $rd1t @{ Gbpr = $rd1tFixture.Gbpr; Sources = $rd1tFixture.SourceP } 'RD1T final'
  Assert-GbdpFileAbsent $rd1t 'R.GDJ'
  # RD1 and RD1T share Slots/Generation/Events, and neither R.GPR nor a
  # CHRDATA<n>.GAM embeds a path or case name, so their final destination
  # bytes must be equal outright -- "after normalising the case name" is
  # trivial here, made explicit rather than assumed.
  Assert-GbdpBytesEqual `
    ([IO.File]::ReadAllBytes((Join-Path $rd1t.Dir 'R.GPR'))) `
    ([IO.File]::ReadAllBytes((Join-Path $rd1.Dir 'R.GPR'))) `
    'RD1T vs RD1 final R.GPR'
  foreach ($ord in $rd1Fixture.SourceP.Keys) {
    $slot = $rd1Fixture.Slots[$ord]
    Assert-GbdpBytesEqual `
      ([IO.File]::ReadAllBytes((Join-Path $rd1t.SaveDir "CHRDATA$slot.GAM"))) `
      ([IO.File]::ReadAllBytes((Join-Path $rd1.SaveDir "CHRDATA$slot.GAM"))) `
      "RD1T vs RD1 final CHRDATA$slot.GAM"
  }
}
$script:gbdpCases += ,$rd1t
foreach ($line in $rd1t.Commands) { [void]$script:gbdpBatch.AppendLine($line) }

# --- RD2: the same PK6-shape state (BasePath "C:\RD2", recorded source dir
# "C:\RD2\SAVE"), but the one-argument /R runs from C:\ (no cd), so
# damage_journal_derive_save_dir computes the ROOT case "C:\SAVE" instead --
# a mismatch against the recorded field. This must fail closed as
# "(result)"/BAD with zero writes: the reader's G2 match, not merely
# parse_args, still gates the derived form. --------------------------------
$rd2Fixture = New-GbdpFaultFixtureDir -Name 'RD2' -Slots $gbdpDerangement -Generation 1 -Events $rd1Events
[IO.File]::WriteAllBytes((Join-Path $rd2Fixture.Dir 'R.GPR'), $rd2Fixture.Model.Gbpr)
foreach ($ord in $rd2Fixture.Model.Sources.Keys) {
  $slot = $rd2Fixture.Slots[$ord]
  [IO.File]::WriteAllBytes((Join-Path $rd2Fixture.SaveDir "CHRDATA$slot.GAM"), $rd2Fixture.Model.Sources[$ord])
}
[IO.File]::WriteAllBytes((Join-Path $rd2Fixture.Dir 'R.GDJ'), $rd2Fixture.PreparedJournalBytes)
$rd2 = @{
  Name = 'RD2'; Dir = $rd2Fixture.Dir; SaveDir = $rd2Fixture.SaveDir
  Fixture = @{ Slots = $rd2Fixture.Slots }
  ExpectedLog = 'CCHOST: invalid host request (result)'; ExpectedStatus = 'BAD'
  Commands = (New-GbdpCommandLines -Name 'RD2' -CdTarget $null -Command "C:\CCHOST.COM /R $($rd2Fixture.RosterArg)")
  Setup = 'RD2: one-argument /R run from C:\ derives C:\SAVE, which mismatches the recorded C:\RD2\SAVE -- must fail closed, zero writes'
}
$rd2['Expect'] = {
  Invoke-GbdpZeroWriteExpect $rd2
  Assert-GbdpBytesEqual ([IO.File]::ReadAllBytes((Join-Path $rd2Fixture.Dir 'R.GDJ'))) $rd2Fixture.PreparedJournalBytes 'RD2 final R.GDJ'
}
$script:gbdpCases += ,$rd2
foreach ($line in $rd2.Commands) { [void]$script:gbdpBatch.AppendLine($line) }

[IO.File]::WriteAllText((Join-Path $gbdpRun 'GBDPCHK.BAT'), $gbdpBatch.ToString(), [Text.Encoding]::ASCII)

$gbdpConf = Join-Path $gbdpRun '_cchost-gbdp.conf'
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[autoexec]
mount C "$gbdpRun"
mount D "$gbdpRootD"
C:
call C:\GBDPCHK.BAT
exit
"@ | Set-Content -Path $gbdpConf -Encoding ASCII

# --- Snapshot (explicit exclusion lists, never GBDR's [A-Z0-9]+[MA] regex,
# which would silently exclude any case directory whose name happens to end
# in M or A). 7a.4 appends its own <C>M/<C>A fault-snapshot-copy directory
# NAMES to $gbdpExcludedDirNames below when it adds those cases. ------------
$gbdpExcludedFileNames = @('stdout.txt', 'stderr.txt', 'GBDPCHK.BAT', '_cchost-gbdp.conf')
$gbdpExcludedDirNames = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
# Fault half (7a.4a REGION 2): the host-side <C>M intermediate snapshot
# copies are excluded from directory-mtime capture by explicit name.
foreach ($n in @('PK1M', 'PK2M', 'PK3M', 'PK4M', 'PK5M', 'PK6M', 'PK7M', 'PF1M', 'PW1M', 'PLM')) {
  [void]$gbdpExcludedDirNames.Add($n)
}
# 7b (amendment I): the new rows' own host-side <C>M / <C>P / <C>DM scratch
# snapshot directory names. DR12M is New-GbdpZeroWriteThenRecoverRow's own
# post-first-command snapshot; PKRP/PKFP are New-GbdpFaultRow's new probe
# snapshot (only PKR/PKF pass -ProbeBuildExt, so only those two exist).
# PK7 and PK7C themselves are real case directories (not scratch copies) and
# are NOT added here -- session 2 below snapshots them on purpose.
foreach ($n in @('PK3DM', 'PK4DM', 'PK5DM', 'PK6DM', 'PF1DM', 'PKRM', 'PKRP', 'PKFM', 'PKFP', 'DR12M', 'PK7CM')) {
  [void]$gbdpExcludedDirNames.Add($n)
}
function Get-GbdpSnapshot([string]$Dir) {
  $files = Get-ChildItem -Path $Dir -Recurse -File | Where-Object {
    $_.Extension -notin @('.LOG', '.STA') -and $_.Name -notlike 'CCHOST.*' -and
    ($gbdpExcludedFileNames -notcontains $_.Name)
  }
  $fileSnap = foreach ($f in $files) {
    [PSCustomObject]@{
      Path = $f.FullName.Substring($Dir.Length); Size = $f.Length
      LastWriteTimeUtc = $f.LastWriteTimeUtc.Ticks
      Hash = (Get-FileHash -Path $f.FullName -Algorithm SHA256).Hash
    }
  }
  $dirs = Get-ChildItem -Path $Dir -Recurse -Directory | Where-Object { -not $gbdpExcludedDirNames.Contains($_.Name) }
  $dirSnap = foreach ($d in $dirs) {
    [PSCustomObject]@{ Path = $d.FullName.Substring($Dir.Length); LastWriteTimeUtc = $d.LastWriteTimeUtc.Ticks }
  }
  return @{ Files = @($fileSnap | Sort-Object Path); Dirs = @($dirSnap | Sort-Object Path) }
}

$gbdpBefore = Get-GbdpSnapshot $gbdpRun
$gbdpProcess = Start-DosBoxSmoke -Dosbox $dosbox -Conf $gbdpConf -Headless:$Headless
if (-not $gbdpProcess.WaitForExit(240000)) {
  Stop-DosBoxSmoke -Process $gbdpProcess
  throw 'DOSBox did not exit while running the CCHOST GBDP direct-DAMAGE journal producer matrix'
}
$gbdpAfter = Get-GbdpSnapshot $gbdpRun
# Read-only attributes are needed only to make DOSBox's own delete/open fail
# during the run just captured; clear them after (never before) the
# after-snapshot.
foreach ($f in $gbdpReadOnlyFiles) { Set-ItemProperty -Path $f -Name IsReadOnly -Value $false }

foreach ($c in $gbdpCases) { & $c.Expect $c }

# --- Session invariants (plan 14.6/15.7) --------------------------------------
# No .GDN survives any case here, EXCEPT the two rows that specifically prove
# a pre-existing stale .GDN is left untouched by a rejection (DR5, DRG).
# PK1/PK2's .GDN survives only in their <C>M intermediate copies, which this
# loop never inspects (it reads $c.Dir only), so they need no exception here;
# see the fault-half note below.
$gbdpGdnSurvivorNames = @('DR5', 'DRG')
# Fault half (7a.4a REGION 3), reviewed at checkpoint 8 (plan section 17.3).
# PK1 and PK2 legitimately carry a .GDN in their <C>M snapshot copy (the
# crash point captures it mid-produce / mid-replace respectively), but that
# check only ever inspects each case's REAL final directory ($c.Dir), never
# $c.MDir -- and PK1/PK2's own final directories must have NO .GDN once
# their retry commits (plan 14.6's own row: "'.GDN' gone"). So PK1 and PK2
# are deliberately NOT added here: adding them would only weaken a check
# that should, and does, hold for their final state without any exception,
# and a future regression that left a stray .GDN behind after a successful
# retry is exactly the defect this loop exists to catch.
#
# PG is different: its real final directory keeps its stale .GDN forever,
# because D4 refuses (result) before ever touching it (checkpoint 7 section
# 16.3). PG is therefore the only addition this region makes.
$gbdpGdnSurvivorNames += @('PG')
# plan §22.5 J.1: RN2 proves a stale .GDN survives /R untouched when no
# .GDJ exists ("/R leaves that .GDN alone"). Its real final directory keeps
# that .GDN forever, by design -- the same shape as PG above.
$gbdpGdnSurvivorNames += @('RN2')
foreach ($c in $gbdpCases) {
  if ($gbdpGdnSurvivorNames -contains $c.Name) { continue }
  if (Test-Path (Join-Path $c.Dir 'R.GDN')) {
    throw "$($c.Name): R.GDN survived the run"
  }
}

Write-Output 'GBDP direct-DAMAGE journal producer matrix (plan step 7a): all DP/DR/DA and PK/PF/PW/PV/PL/PG cases verified'

# --- Session 2 (7b, amendment A4 / plan 20.5 & 17.5): PK7's mtime-unchanged
# claim ("dest byte- and mtime-unchanged by /R") and its write-oracle
# control PK7C, each run in a SEPARATE DOSBox session so a host-side
# snapshot can bracket them by real wall-clock time. Session 1 above already
# proved PK7's crash leaves a byte-complete COMMITTED write and proved
# PK7C's crash leaves a genuine PREPARED journal untouched at P; this
# session only adds the follow-up commands and the mtime claim that needed
# the two sessions to be told apart. -----------------------------------------
function New-Gbdp2CommandLines([string]$Name, [string]$CdTarget, [string]$Command) {
  $lines = New-Object System.Collections.Generic.List[string]
  if ($CdTarget) { $lines.Add("cd \$CdTarget") }
  $lines.Add("$Command > C:\S2LOG\$Name.LOG")
  $lines.Add("if errorlevel 8 goto ${Name}_x")
  $lines.Add("if errorlevel 7 goto ${Name}_crash")
  $lines.Add("if errorlevel 1 goto ${Name}_bad")
  $lines.Add("echo OK>C:\S2LOG\$Name.STA")
  $lines.Add("goto ${Name}_done")
  $lines.Add(":${Name}_x")
  $lines.Add("echo OTHER>C:\S2LOG\$Name.STA")
  $lines.Add("goto ${Name}_done")
  $lines.Add(":${Name}_crash")
  $lines.Add("echo CRASH>C:\S2LOG\$Name.STA")
  $lines.Add("goto ${Name}_done")
  $lines.Add(":${Name}_bad")
  $lines.Add("echo BAD>C:\S2LOG\$Name.STA")
  $lines.Add(":${Name}_done")
  if ($CdTarget) { $lines.Add("cd \") }
  return ,$lines.ToArray()
}
function Get-Gbdp2StepOutcome([string]$StepName) {
  $logRaw = Get-Content (Join-Path $gbdpRun "S2LOG\$StepName.LOG") -Raw
  $log = if ($null -eq $logRaw) { '' } else { $logRaw.Trim() }
  $status = (Get-Content (Join-Path $gbdpRun "S2LOG\$StepName.STA") -Raw).Trim()
  return @{ Log = $log; Status = $status }
}
function Assert-Gbdp2StepOutcome([string]$StepName, [string]$ExpectedLog, [string]$ExpectedStatus) {
  $r = Get-Gbdp2StepOutcome $StepName
  if ($r.Log -ne $ExpectedLog -or $r.Status -ne $ExpectedStatus) {
    throw "$StepName expected log '$ExpectedLog' status '$ExpectedStatus', got log '$($r.Log)' status '$($r.Status)'"
  }
}
# Snapshot helper: Get-GbdpSnapshot always roots at $gbdpRun (so the CASE
# DIRECTORY's own mtime is captured as one of the recursed entries, the way
# session 1's own $gbdpBefore/$gbdpAfter does); this filters that snapshot
# down to just the one case's subtree instead of rooting a second,
# narrower snapshot at the case directory itself (which would miss the case
# directory's OWN mtime, since Get-ChildItem -Recurse never returns its own
# starting directory).
function Select-GbdpSnapshotUnder([hashtable]$Snapshot, [string]$Prefix) {
  $filesUnder = @($Snapshot.Files | Where-Object { $_.Path -eq $Prefix -or $_.Path.StartsWith("$Prefix\", [StringComparison]::OrdinalIgnoreCase) })
  $dirsUnder = @($Snapshot.Dirs | Where-Object { $_.Path -eq $Prefix -or $_.Path.StartsWith("$Prefix\", [StringComparison]::OrdinalIgnoreCase) })
  return @{ Files = $filesUnder; Dirs = $dirsUnder }
}

New-Item -ItemType Directory -Force (Join-Path $gbdpRun 'S2LOG') | Out-Null
$s2BeforeAll = Get-GbdpSnapshot $gbdpRun
$s2BeforePk7 = Select-GbdpSnapshotUnder $s2BeforeAll '\PK7'
$s2BeforePk7c = Select-GbdpSnapshotUnder $s2BeforeAll '\PK7C'
Start-Sleep -Seconds 3   # exceeds FAT's ~2s mtime granularity

$gbdp2Batch = [Text.StringBuilder]::new()
[void]$gbdp2Batch.AppendLine('mkdir C:\S2LOG')
$gbdp2Batch.ToString() | Out-Null
foreach ($line in (New-Gbdp2CommandLines -Name 'PK7_R1' -CdTarget 'PK7' -Command "C:\CCHOST.COM /R $($pk7Fixture.RosterArg) $($pk7Fixture.SaveArg)")) { [void]$gbdp2Batch.AppendLine($line) }
foreach ($line in (New-Gbdp2CommandLines -Name 'PK7_R2' -CdTarget 'PK7' -Command "C:\CCHOST.COM /D $($pk7Fixture.EffectArg) $($pk7Fixture.RosterArg) /J")) { [void]$gbdp2Batch.AppendLine($line) }
foreach ($line in (New-Gbdp2CommandLines -Name 'PK7C_R1' -CdTarget 'PK7C' -Command "C:\CCHOST.COM /D $($pk7cFixture.EffectArg) $($pk7cFixture.RosterArg) /J")) { [void]$gbdp2Batch.AppendLine($line) }
[IO.File]::WriteAllText((Join-Path $gbdpRun 'GBDP2CHK.BAT'), $gbdp2Batch.ToString(), [Text.Encoding]::ASCII)

$gbdp2Conf = Join-Path $gbdpRun '_cchost-gbdp2.conf'
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[autoexec]
mount C "$gbdpRun"
C:
call C:\GBDP2CHK.BAT
exit
"@ | Set-Content -Path $gbdp2Conf -Encoding ASCII

$gbdp2Process = Start-DosBoxSmoke -Dosbox $dosbox -Conf $gbdp2Conf -Headless:$Headless
if (-not $gbdp2Process.WaitForExit(120000)) {
  Stop-DosBoxSmoke -Process $gbdp2Process
  throw 'DOSBox did not exit while running the CCHOST GBDP session-2 (PK7/PK7C) check'
}

Assert-Gbdp2StepOutcome 'PK7_R1' 'CCHOST: effect damage already committed' 'OK'
Assert-Gbdp2StepOutcome 'PK7_R2' 'CCHOST: effect damage already committed' 'OK'
Assert-Gbdp2StepOutcome 'PK7C_R1' 'CCHOST: effect damage applied' 'OK'

$s2AfterAll = Get-GbdpSnapshot $gbdpRun
$s2AfterPk7 = Select-GbdpSnapshotUnder $s2AfterAll '\PK7'
$s2AfterPk7c = Select-GbdpSnapshotUnder $s2AfterAll '\PK7C'

# PK7: every file AND directory under PK7\ (PK7M\ is excluded by name
# already, so this never sees the <C>M scratch copy) is byte-, size- and
# mtime-identical across the two DOSBox sessions -- this is the deferred
# §17.5 assertion.
foreach ($f in $s2BeforePk7.Files) {
  $af = $s2AfterPk7.Files | Where-Object { $_.Path -eq $f.Path } | Select-Object -First 1
  if ($null -eq $af) { throw "PK7 S2: $($f.Path) disappeared between S2-before and S2-after" }
  if ($af.Size -ne $f.Size -or $af.LastWriteTimeUtc -ne $f.LastWriteTimeUtc -or $af.Hash -ne $f.Hash) {
    throw "PK7 S2: $($f.Path) changed between S2-before and S2-after"
  }
}
if ($s2AfterPk7.Files.Count -ne $s2BeforePk7.Files.Count) { throw 'PK7 S2: file count under PK7\ changed between S2-before and S2-after' }
foreach ($d in $s2BeforePk7.Dirs) {
  $ad = $s2AfterPk7.Dirs | Where-Object { $_.Path -eq $d.Path } | Select-Object -First 1
  if ($null -eq $ad) { throw "PK7 S2: directory $($d.Path) missing from S2-after" }
  if ($ad.LastWriteTimeUtc -ne $d.LastWriteTimeUtc) { throw "PK7 S2: directory $($d.Path) mtime changed between S2-before and S2-after" }
}

# PK7C: the write-oracle control. If any of these do not move, the
# instrument is blind and PK7's pass above is not evidence of anything.
$pk7cGpr = @{ Before = ($s2BeforePk7c.Files | Where-Object { $_.Path -eq '\PK7C\R.GPR' } | Select-Object -First 1)
              After  = ($s2AfterPk7c.Files  | Where-Object { $_.Path -eq '\PK7C\R.GPR' } | Select-Object -First 1) }
if ($null -eq $pk7cGpr.Before -or $null -eq $pk7cGpr.After) { throw 'PK7C S2: R.GPR missing from a snapshot' }
if ($pk7cGpr.After.LastWriteTimeUtc -le $pk7cGpr.Before.LastWriteTimeUtc) { throw 'PK7C S2 control: R.GPR mtime did not move -- instrument blind' }

$pk7cTargetSlot = $pk7cFixture.Slots[1]   # ordinal 1 = Target 2 (1-based), this fixture's own event
$pk7cSrcRel = "\PK7C\SAVE\CHRDATA$pk7cTargetSlot.GAM"
$pk7cSrc = @{ Before = ($s2BeforePk7c.Files | Where-Object { $_.Path -eq $pk7cSrcRel } | Select-Object -First 1)
              After  = ($s2AfterPk7c.Files  | Where-Object { $_.Path -eq $pk7cSrcRel } | Select-Object -First 1) }
if ($null -eq $pk7cSrc.Before -or $null -eq $pk7cSrc.After) { throw 'PK7C S2: targeted CHRDATA missing from a snapshot' }
if ($pk7cSrc.After.LastWriteTimeUtc -le $pk7cSrc.Before.LastWriteTimeUtc) { throw 'PK7C S2 control: targeted CHRDATA mtime did not move -- instrument blind' }

$pk7cGdj = @{ Before = ($s2BeforePk7c.Files | Where-Object { $_.Path -eq '\PK7C\R.GDJ' } | Select-Object -First 1)
              After  = ($s2AfterPk7c.Files  | Where-Object { $_.Path -eq '\PK7C\R.GDJ' } | Select-Object -First 1) }
if ($null -eq $pk7cGdj.Before -or $null -eq $pk7cGdj.After) { throw 'PK7C S2: R.GDJ missing from a snapshot' }
if ($pk7cGdj.After.LastWriteTimeUtc -le $pk7cGdj.Before.LastWriteTimeUtc) { throw 'PK7C S2 control: R.GDJ mtime did not move -- instrument blind' }

$pk7cDir = @{ Before = ($s2BeforePk7c.Dirs | Where-Object { $_.Path -eq '\PK7C' } | Select-Object -First 1)
              After  = ($s2AfterPk7c.Dirs  | Where-Object { $_.Path -eq '\PK7C' } | Select-Object -First 1) }
if ($null -eq $pk7cDir.Before -or $null -eq $pk7cDir.After) { throw 'PK7C S2: case directory missing from a directory snapshot' }
if ($pk7cDir.After.LastWriteTimeUtc -le $pk7cDir.Before.LastWriteTimeUtc) { throw 'PK7C S2 control: case directory mtime did not move -- instrument blind' }

# PK7C final state: the model applied exactly once, COMMITTED (same shape as
# PK3/PK3D/PK6D's own final assertions).
Assert-GbdpBytesEqual ([IO.File]::ReadAllBytes((Join-Path $pk7cFixture.Dir 'R.GDJ'))) $pk7cFixture.CommittedJournalBytes 'PK7C final R.GDJ'
Assert-GbdpRealState @{ Dir = $pk7cFixture.Dir; SaveDir = $pk7cFixture.SaveDir; Fixture = @{ Slots = $pk7cFixture.Slots } } $pk7cFixture.Model 'PK7C final'

Write-Output 'GBDP session 2 (plan step 7b, amendment A4): PK7 mtime-unchanged and PK7C write-oracle control verified'

Write-Output 'RESULT: CCHOST GBHR contract smoke PASS'
