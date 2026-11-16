# CCCOMBAT real Amiga GLIB MONCHA smoke.
#
# Mandatory synthetic parity plus optional non-DQK Gen2 monster libraries. It stages real
# Secret/Gateway Amiga MONCHA GLIB containers and proves CCCOMBAT can import
# their big-endian metadata while reusing the existing MONCHA RLE/stat path.
param(
  [switch]$Headless,
  [string]$SecretPath = $env:GOLDBOX_SECRET_PATH,
  [string]$GatewayPath = $env:GOLDBOX_GATEWAY_PATH
)

$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$run = Join-Path $build 'cccombat-glib-moncha-test'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: CCCOMBAT GLIB MONCHA smoke (DOSBox.exe absent)'
  exit 0
}

if (-not $SecretPath) {
  foreach ($candidate in @(
    'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\MyCollection\AD&D\SecretOfTheSilverBlades\data',
    'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDPacks\S\SecretOfTheSilverBlades\data'
  )) {
    if (Test-Path $candidate) {
      $SecretPath = $candidate
      break
    }
  }
}

if (-not $GatewayPath) {
  foreach ($candidate in @(
    'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\MyCollection\AD&D\GatewayToSavageFrontier\data',
    'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDPacks\G\GatewayToSavageFrontier\data'
  )) {
    if (Test-Path $candidate) {
      $GatewayPath = $candidate
      break
    }
  }
}

$secretMon = if ($SecretPath) { Join-Path $SecretPath 'DISK2\MONCHA.GLB' } else { $null }
$gatewayMon = if ($GatewayPath) { Join-Path $GatewayPath 'DiskB\MonCha.glb' } else { $null }
$cases = @()
if ($secretMon -and (Test-Path $secretMon)) {
  $cases += @{ Label = 'Secret'; Source = $secretMon; Mon = 'SECMON.GLB'; Fx = 'SECRET.EFX'; Trace = 'SECRET.TRC'; Out = 'SECRET.OUT'; Raw = 'SECRET.RAW'; Txt = 'SECRET.TXT' }
}
if ($gatewayMon -and (Test-Path $gatewayMon)) {
  $cases += @{ Label = 'Gateway'; Source = $gatewayMon; Mon = 'GATEMON.GLB'; Fx = 'GATEWAY.EFX'; Trace = 'GATEWAY.TRC'; Out = 'GATEWAY.OUT'; Raw = 'GATEWAY.RAW'; Txt = 'GATEWAY.TXT' }
}
foreach ($case in $cases) {
  $bytes = [IO.File]::ReadAllBytes($case.Source)
  if ($bytes.Length -lt 16) {
    throw "CCCOMBAT $($case.Label) GLIB MONCHA source has a truncated header: $($case.Source)"
  }
  $magic = [Text.Encoding]::ASCII.GetString($bytes, 0, 4)
  if ($magic -ne 'GLIB') {
    throw "CCCOMBAT $($case.Label) GLIB MONCHA source is not GLIB: $($case.Source)"
  }
}

& (Join-Path $native 'build.ps1') -Target cccombat
. (Join-Path $native 'dosbox-smoke.ps1')

if (Test-Path $run) {
  $resolvedRun = [IO.Path]::GetFullPath($run)
  $resolvedBuild = [IO.Path]::GetFullPath($build)
  if (-not $resolvedRun.StartsWith($resolvedBuild, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove unexpected test directory: $resolvedRun"
  }
  Remove-Item -Recurse -Force $run
}
New-Item -ItemType Directory -Force $run | Out-Null
Copy-Item (Join-Path $build 'cccombat.com') (Join-Path $run 'CCCOMBAT.COM') -Force

function Write-GbefCombatFixture([string]$Path) {
  $fx = [byte[]]::new(116)
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

foreach ($case in $cases) {
  Copy-Item $case.Source (Join-Path $run $case.Mon) -Force
  Write-GbefCombatFixture (Join-Path $run $case.Fx)
}

# Paired control for the GLIB raw-422 path. Both containers resolve logical id
# 0 to member 1, the same source-derived DQK record; the twin stores it as
# length-prefixed GLIB MONCHA RLE and the raw case stores 422 bytes. Equal traces prove that
# the raw path copied the allocated FS buffer rather than unrelated DS bytes.
function New-SyntheticDqkFixedMonRecord {
  param([int]$Thac0=1,[int]$Ac=-10,[int]$HitDice=7,[int]$DamageCount=1,[int]$DamageSides=2,[int]$DamageBonus=4)
  [byte[]]$raw = [byte[]]::new(422)
  [BitConverter]::GetBytes([UInt16]250).CopyTo($raw, 0x054)
  $raw[0x058] = 7
  $raw[0x066] = 1
  [Text.Encoding]::ASCII.GetBytes('RAW422 CONTROL').CopyTo($raw, 0x068)
  for ($i=0; $i -lt 12; $i++) { $raw[0x078+$i] = 10 }
  $raw[0x078+15] = [byte](60-$Thac0)
  $raw[0x078+25] = [byte]$HitDice
  $raw[0x078+61] = [byte]$DamageCount
  $raw[0x078+63] = [byte]$DamageSides
  $raw[0x078+65] = [byte]($DamageBonus -band 0xff)
  $raw[0x078+67] = [byte](60-$Ac)
  return ,$raw
}
function ConvertTo-MonchaRle([byte[]]$Raw) {
  $encoded = [Collections.Generic.List[byte]]::new()
  for ($p=0; $p -lt $Raw.Length; $p+=128) {
    $n=[Math]::Min(128,$Raw.Length-$p)
    $encoded.Add([byte]($n-1))
    for($i=0;$i -lt $n;$i++){ $encoded.Add($Raw[$p+$i]) }
  }
  return ,$encoded.ToArray()
}
function Write-MonchaLibrary([string]$Path,[bool]$Glb,[byte[]]$Raw,[bool]$Raw422=$false) {
  $idTable = if($Glb){[byte[]]@(0,1,0,0,0,1)}else{[byte[]]@(1,0,0,0,1,0)}
  if($Glb -and $Raw422){
    [byte[]]$member=$Raw
  }else{
    [byte[]]$rle=ConvertTo-MonchaRle $Raw
    $member=[byte[]]::new(2+$rle.Length)
    $member[0]=[byte](($Raw.Length -shr 8) -band 255); $member[1]=[byte]($Raw.Length -band 255)
    [Array]::Copy($rle,0,$member,2,$rle.Length)
  }
  $member0Start=28; $member0End=$member0Start+$idTable.Length; $member1Start=$member0End; $member1End=$member1Start+$member.Length
  [byte[]]$file=[byte[]]::new($member1End)
  if($Glb){[Text.Encoding]::ASCII.GetBytes('GLIB').CopyTo($file,0);$file[8]=0;$file[9]=2;[Text.Encoding]::ASCII.GetBytes('DATA').CopyTo($file,12)}
  else{[Text.Encoding]::ASCII.GetBytes('HLIB').CopyTo($file,0);$file[8]=2;$file[9]=0;[Text.Encoding]::ASCII.GetBytes('DATA').CopyTo($file,12)}
  # Three boundary pointers define member 0 (id table) and member 1.
  foreach($entry in @(@{Index=0;Value=$member0Start},@{Index=1;Value=$member1Start},@{Index=2;Value=$member1End})){
    $o=16+4*$entry.Index
    if($Glb){$file[$o+2]=[byte](($entry.Value -shr 8) -band 255);$file[$o+3]=[byte]($entry.Value -band 255)}
    else{[BitConverter]::GetBytes([UInt16]$entry.Value).CopyTo($file,$o)}
  }
  [Array]::Copy($idTable,0,$file,$member0Start,$idTable.Length)
  [Array]::Copy($member,0,$file,$member1Start,$member.Length)
  [IO.File]::WriteAllBytes($Path,$file)
}

[byte[]]$syntheticRaw=New-SyntheticDqkFixedMonRecord
$syntheticCases=@(
  @{Label='Synthetic GLIB raw422';Mon='RAW422.GLB';Fx='RAW422.EFX';Trace='RAW422.TRC';Out='RAW422.OUT';Raw='RAW422.RAW';Txt='RAW422.TXT';Glb=$true;Raw422=$true},
  @{Label='Synthetic GLIB RLE twin';Mon='RLE422.GLB';Fx='RLE422.EFX';Trace='RLE422.TRC';Out='RLE422.OUT';Raw='RLE422.RAW';Txt='RLE422.TXT';Glb=$true;Raw422=$false},
  @{Label='Synthetic GLIB RLE changed-HP control';Mon='HPCHANGE.GLB';Fx='HPCHANGE.EFX';Trace='HPCHANGE.TRC';Out='HPCHANGE.OUT';Raw='HPCHANGE.RAW';Txt='HPCHANGE.TXT';Glb=$true;Raw422=$false;HitDice=8}
)
foreach($case in $syntheticCases){
  Write-GbefCombatFixture (Join-Path $run $case.Fx)
  [byte[]]$caseRaw = if($case.HitDice){New-SyntheticDqkFixedMonRecord -HitDice $case.HitDice}else{$syntheticRaw}
  Write-MonchaLibrary (Join-Path $run $case.Mon) $case.Glb $caseRaw $case.Raw422
}
$cases += $syntheticCases

$commands = [System.Collections.Generic.List[string]]::new()
foreach ($case in $cases) {
  $commands.Add(('CCCOMBAT /E C:\{0} C:\{1} 4660 C:\{2} C:\{3} C:\{4} > C:\{5}' -f $case.Fx, $case.Mon, $case.Trace, $case.Out, $case.Raw, $case.Txt))
}

$conf = Join-Path $build '_cccombat_glib_moncha_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$run"
C:
$($commands -join "`r`n")
exit
"@ | Set-Content $conf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-DosBoxSmoke -Process $p
  throw 'CCCOMBAT Amiga GLIB MONCHA smoke timed out'
}

function Assert-RawFrame([string]$Path, [string]$Label) {
  if (-not (Test-Path $Path)) { throw "$Label missing RAW frame" }
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -ne (4 + (320 * 200) + 768) -or
      [BitConverter]::ToUInt16($bytes, 0) -ne 320 -or
      [BitConverter]::ToUInt16($bytes, 2) -ne 200) {
    throw "$Label wrote an invalid 320x200 RAW frame"
  }
  $nonZero = 0
  for ($i = 4; $i -lt (4 + (320 * 200)); $i++) {
    if ($bytes[$i] -ne 0) { $nonZero++ }
  }
  if ($nonZero -lt 512) {
    throw "$Label produced an implausibly blank frame nonZero=$nonZero"
  }
}

foreach ($case in $cases) {
  $txt = Get-Content (Join-Path $run $case.Txt) -Raw
  if ($txt -notlike '*outcome:*') {
    throw "CCCOMBAT $($case.Label) GLIB MONCHA output missing outcome"
  }
  $trace = Get-Content (Join-Path $run $case.Trace) -Raw
  foreach ($needle in @('init p0', 'init e0', 'end')) {
    if ($trace -notlike "*$needle*") {
      throw "CCCOMBAT $($case.Label) GLIB MONCHA trace missing: $needle"
    }
  }
  $outcome = (Get-Content (Join-Path $run $case.Out) -Raw).Trim()
  if (@('party', 'enemy', 'draw') -notcontains $outcome) {
    throw "CCCOMBAT $($case.Label) GLIB MONCHA invalid outcome: $outcome"
  }
  Assert-RawFrame (Join-Path $run $case.Raw) "CCCOMBAT $($case.Label) GLIB MONCHA"
}

$raw422Trace=Get-Content (Join-Path $run 'RAW422.TRC') -Raw
$rle422Trace=Get-Content (Join-Path $run 'RLE422.TRC') -Raw
foreach($expected in @('1 attack p0 e0 17 25 0 - 32 -','1 attack e0 p0 12 -4 1 5 9 -')){
  if($rle422Trace -notlike "*$expected*"){
    throw "Synthetic GLIB RLE source-derived stat oracle missing: $expected"
  }
}
if($raw422Trace -cne $rle422Trace){
  throw 'Synthetic GLIB raw422 trace differs from equivalent GLIB RLE trace'
}
foreach($expected in @('1 attack p0 e0 17 25 0 - 32 -','1 attack e0 p0 12 -4 1 5 9 -')){
  if($raw422Trace -notlike "*$expected*"){
    throw "Synthetic GLIB raw422 source-derived stat assertion missing: $expected"
  }
}
$hpChangeTrace=Get-Content (Join-Path $run 'HPCHANGE.TRC') -Raw
if($hpChangeTrace -notlike '*1 attack p0 e0 17 25 0 - 36 -*' -or $hpChangeTrace -ceq $rle422Trace){
  throw 'Synthetic GLIB changed-HP payload control did not move the source-derived HP trace from 32 to 36'
}
foreach($ext in @('OUT','RAW')){
  $leftHash=(Get-FileHash (Join-Path $run "RAW422.$ext") -Algorithm SHA256).Hash
  $rightHash=(Get-FileHash (Join-Path $run "RLE422.$ext") -Algorithm SHA256).Hash
  if($leftHash -ne $rightHash){
    throw "Synthetic GLIB raw422 and RLE $ext outputs differ"
  }
}

Write-Output ("RESULT: CCCOMBAT GLIB MONCHA real-data and raw422/RLE parity smoke PASS ({0})" -f (($cases | ForEach-Object { $_.Label }) -join ', '))
