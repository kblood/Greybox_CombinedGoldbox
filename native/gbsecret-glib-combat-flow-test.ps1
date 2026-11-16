# GBBOOT Secret of the Silver Blades Amiga/WHDLoad GLIB ECL -> CCCOMBAT flow.
#
# Optional local smoke that stages the original Secret Amiga GLIB ECL/GEO/MONCHA
# files unchanged, then uses a known direct-entry combat island in area 16:
# LOAD_MONSTER(72,5,72) -> COMBAT. This proves GBBOOT's native /E chain can
# move from real GLIB ECL into the native tactical engine, not only render maps.
param(
  [switch]$Headless,
  [string]$SecretPath = $env:GOLDBOX_SECRET_PATH,
  [string]$SecretDosPath = $env:GOLDBOX_SECRET_DOS_PATH,
  [string]$EvidenceRoot,
  [string]$ComPath
)

$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$run = Join-Path $build 'gbsecret-glib-combat-flow-test'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: GBBOOT Secret Amiga GLIB combat flow (DOSBox.exe absent)'
  exit 0
}

if (-not $SecretPath) {
  $candidates = @(
    'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\MyCollection\AD&D\SecretOfTheSilverBlades\data',
    'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDPacks\S\SecretOfTheSilverBlades\data',
    'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDLoad Collection\Games-WHDLoad\unpacked\SecretOfTheSilverBlades\data',
    'D:\Games\Emulator\Amiga\Non-ADF\HD\AD&D\Pool\SilverBlades'
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      $SecretPath = $candidate
      break
    }
  }
}

if (-not $SecretPath -or -not (Test-Path $SecretPath)) {
  Write-Output 'SKIP: GBBOOT Secret Amiga GLIB combat flow (set GOLDBOX_SECRET_PATH to run)'
  exit 0
}

$ecl = Join-Path $SecretPath 'DISK2\ECL.GLB'
$geo = Join-Path $SecretPath 'DISK2\GEO.GLB'
$mon = Join-Path $SecretPath 'DISK2\MONCHA.GLB'
foreach ($path in @($ecl, $geo, $mon)) {
  if (-not (Test-Path $path)) {
    Write-Output "SKIP: GBBOOT Secret Amiga GLIB combat flow ($path absent)"
    exit 0
  }
  $bytes = [IO.File]::ReadAllBytes($path)
  $magic = [Text.Encoding]::ASCII.GetString($bytes[0..3])
  if ($magic -ne 'GLIB') {
    Write-Output "SKIP: GBBOOT Secret Amiga GLIB combat flow ($path is not GLIB)"
    exit 0
  }
}

if (-not $SecretDosPath) { $SecretDosPath = 'C:\Program Files (x86)\GOG Galaxy\Games\Secret of the Silver Blades' }
foreach ($slot in 1..6) {
  if (-not (Test-Path -LiteralPath (Join-Path $SecretDosPath "CHRDATA$slot.SAV") -PathType Leaf)) {
    Write-Output 'SKIP: Secret owned combat handoff (six DOS pregens absent)'
    exit 0
  }
}

if ($ComPath) {
  if (-not (Test-Path -LiteralPath $ComPath -PathType Leaf)) { throw "Requested CCCOMBAT binary is absent: $ComPath" }
} else {
  & (Join-Path $native 'build.ps1') -Target engine
}
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
Copy-Item $ecl (Join-Path $run 'ECL.GLB') -Force
Copy-Item $geo (Join-Path $run 'GEO.GLB') -Force
Copy-Item $mon (Join-Path $run 'MONCHA.GLB') -Force

function Assert-RawFrame([string]$Path, [string]$Label, [int]$MinColors = 4) {
  if (-not (Test-Path $Path)) { throw "$Label missing RAW frame" }
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -ne (4 + (320 * 200) + 768) -or
      [BitConverter]::ToUInt16($bytes, 0) -ne 320 -or
      [BitConverter]::ToUInt16($bytes, 2) -ne 200) {
    throw "$Label wrote an invalid 320x200 RAW frame"
  }
  $seen = New-Object bool[] 256
  $nonZero = 0
  $colors = 0
  for ($i = 4; $i -lt (4 + (320 * 200)); $i++) {
    $pix = [int]$bytes[$i]
    if ($pix -ne 0) { $nonZero++ }
    if (-not $seen[$pix]) {
      $seen[$pix] = $true
      $colors++
    }
  }
  if ($nonZero -lt 512 -or $colors -lt $MinColors) {
    throw "$Label produced an implausibly blank frame nonZero=$nonZero colors=$colors"
  }
}

function Read-U16BE([byte[]]$Bytes, [int]$Offset) {
  return (($Bytes[$Offset] -shl 8) -bor $Bytes[$Offset + 1])
}

function Read-U32BE([byte[]]$Bytes, [int]$Offset) {
  return (([uint32]$Bytes[$Offset] -shl 24) -bor
    ([uint32]$Bytes[$Offset + 1] -shl 16) -bor
    ([uint32]$Bytes[$Offset + 2] -shl 8) -bor [uint32]$Bytes[$Offset + 3])
}

function Assert-SecretCombatMonchaPayloadIsConsumed {
  # This direct combat island emits LOAD_MONSTER(72,5,72).  Resolve monster 72
  # through MONCHA.GLB's id table, corrupt only that staged record, and require
  # the deterministic combat trace to change or disappear.
  $tracePath = Join-Path $build '_GBCOMB.TRC'
  if (-not (Test-Path $tracePath)) { throw 'GBBOOT Secret combat flow did not write _GBCOMB.TRC' }
  [byte[]]$baselineTrace = [IO.File]::ReadAllBytes($tracePath)
  $artifactPaths = @(
    $tracePath,
    (Join-Path $build '_GBCOMB.OUT'),
    (Join-Path $build '_GBCOMB.RAW'),
    (Join-Path $build '_GBECL.BIN'),
    (Join-Path $build '_GBECL.TXT'),
    (Join-Path $build '_GBWALL.BIN'),
    (Join-Path $build '_GBVIEW.RAW'),
    (Join-Path $build 'GBSECC.TXT')
  )
  $baselineArtifacts = @{}
  foreach ($artifact in $artifactPaths) {
    if (Test-Path $artifact) { $baselineArtifacts[$artifact] = [IO.File]::ReadAllBytes($artifact) }
  }
  $stagedMoncha = Join-Path $run 'MONCHA.GLB'
  [byte[]]$container = [IO.File]::ReadAllBytes($stagedMoncha)
  if ([Text.Encoding]::ASCII.GetString($container, 0, 4) -ne 'GLIB') {
    throw 'GBBOOT Secret staged MONCHA is not a GLIB container'
  }
  $pointerCount = (Read-U16BE $container 8) + 1
  if ($pointerCount -lt 3 -or $container.Length -lt (16 + (4 * $pointerCount))) {
    throw 'GBBOOT Secret staged MONCHA has an invalid GLIB pointer table'
  }
  $idStart = [int](Read-U32BE $container 16)
  $idEnd = [int](Read-U32BE $container 20)
  if ($idStart -lt 0 -or $idEnd -gt $container.Length -or $idEnd -lt ($idStart + 2)) {
    throw 'GBBOOT Secret staged MONCHA has an invalid GLIB id table'
  }
  $idCount = Read-U16BE $container $idStart
  $member = -1
  for ($i = 0; $i -lt $idCount; $i++) {
    $at = $idStart + 2 + (4 * $i)
    if (($at + 3) -ge $idEnd) { throw 'GBBOOT Secret staged MONCHA id table is truncated' }
    if ((Read-U16BE $container $at) -eq 72) {
      $member = Read-U16BE $container ($at + 2)
      break
    }
  }
  if ($member -lt 1 -or $member -ge ($pointerCount - 1)) {
    throw 'GBBOOT Secret staged MONCHA has no monster-72 member pointer'
  }
  $payloadStart = [int](Read-U32BE $container (16 + (4 * $member)))
  $payloadEnd = [int](Read-U32BE $container (20 + (4 * $member)))
  if ($payloadStart -lt 0 -or $payloadEnd -gt $container.Length -or
      ($payloadEnd - $payloadStart) -lt 3) {
    throw 'GBBOOT Secret staged MONCHA monster-72 member is not a valid payload'
  }

  [byte[]]$mutatedContainer = $container.Clone()
  try {
    for ($i = $payloadStart; $i -lt $payloadEnd; $i++) { $mutatedContainer[$i] = 0 }
    [IO.File]::WriteAllBytes($stagedMoncha, $mutatedContainer)
    Remove-Item $artifactPaths -Force -ErrorAction SilentlyContinue
    $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
    if (-not $p.WaitForExit(60000)) {
      Stop-DosBoxSmoke -Process $p
      throw 'GBBOOT Secret mutated combat flow timed out'
    }
    $traceChanged = (-not (Test-Path $tracePath)) -or
      (-not [Linq.Enumerable]::SequenceEqual($baselineTrace, [IO.File]::ReadAllBytes($tracePath)))
    if (-not $traceChanged) {
      throw 'GBBOOT Secret monster-72 MONCHA payload mutation left _GBCOMB.TRC unchanged'
    }
  } finally {
    [IO.File]::WriteAllBytes($stagedMoncha, $container)
    foreach ($artifact in $artifactPaths) {
      if ($baselineArtifacts.ContainsKey($artifact)) {
        [IO.File]::WriteAllBytes($artifact, [byte[]]$baselineArtifacts[$artifact])
      } else {
        Remove-Item $artifact -Force -ErrorAction SilentlyContinue
      }
    }
  }
}

$conf = Join-Path $build '_gbsecret_glib_combat_flow_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /X /A 16 /@ 33930 > C:\GBSECC.TXT
exit
"@ | Set-Content $conf -Encoding ASCII

Remove-Item (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build '_GBWALL.BIN'),
  (Join-Path $build '_GBWSET.GBW'),
  (Join-Path $build '_GBTITLE.RAW'),
  (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build 'GBSECC.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-DosBoxSmoke -Process $p
  throw 'GBBOOT Secret Amiga GLIB combat flow timed out'
}

$out = Get-Content (Join-Path $build 'GBSECC.TXT') -Raw
foreach ($needle in @(
  'game:   Generic Gold Box HLIB/GLB data dump',
  'exec:   (native /E only)',
  'native: CCECL ECL.GLB entry 16 -> CCGEO /B GEO.GLB'
)) {
  if ($out -notlike "*$needle*") {
    throw "GBBOOT Secret Amiga GLIB combat output missing: $needle"
  }
}
if ($out -like '*GBBOOT: native preview failed*') {
  throw 'GBBOOT Secret Amiga GLIB combat native chain failed'
}

$combat = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009',
  'status=0003',
  'GBEC groups=0001',
  '@00 MONSTER id=0048 count=0005 pic=0048'
)) {
  if ($combat -notlike "*$needle*") {
    throw "GBBOOT Secret Amiga GLIB combat dump missing: $needle"
  }
}

$trace = Get-Content (Join-Path $build '_GBCOMB.TRC') -Raw
foreach ($needle in @('init p0', 'init e0', 'end')) {
  if ($trace -notlike "*$needle*") {
    throw "GBBOOT Secret Amiga GLIB combat trace missing: $needle"
  }
}
$outcome = (Get-Content (Join-Path $build '_GBCOMB.OUT') -Raw).Trim()
if (@('party', 'enemy', 'draw') -notcontains $outcome) {
  throw "GBBOOT Secret Amiga GLIB combat invalid outcome: $outcome"
}
Assert-RawFrame (Join-Path $build '_GBCOMB.RAW') 'GBBOOT Secret Amiga GLIB tactical combat'

if (Test-Path (Join-Path $build '_GBRES.TXT')) {
  $resume = Get-Content (Join-Path $build '_GBRES.TXT') -Raw
  if ($resume -notlike '*GBEF v0009*') {
    throw 'GBBOOT Secret Amiga GLIB combat resume dump was not a GBEF record'
  }
}

Assert-SecretCombatMonchaPayloadIsConsumed

# The older harness above remains the legacy no-profile control.  The following
# matrix stages the complete Secret Amiga source set in fresh per-case DOS drives
# and exercises the explicit /9 1 normal-melee profile without touching retail.
if (-not $EvidenceRoot) { $EvidenceRoot = Join-Path $env:TEMP 'gbsecret-glib-combat-flow-evidence' }
$EvidenceRoot = [IO.Path]::GetFullPath($EvidenceRoot)
New-Item -ItemType Directory -Force $EvidenceRoot | Out-Null
$disk2 = Join-Path $SecretPath 'DISK2'
$disk1 = Join-Path $SecretPath 'DISK1'
$inventorySource = Join-Path $disk2 'MONITM.GLB'
$effectsSource = Join-Path $disk2 'MONSPC.GLB'
$catalogSource = Join-Path $disk1 'ITEMS.DAT'
foreach ($path in @($inventorySource, $effectsSource, $catalogSource)) {
  if (-not (Test-Path -LiteralPath $path)) { throw "Secret profile source is missing: $path" }
}

$stageTool = Join-Path $EvidenceRoot 'stage-secret-glib.py'
@'
import pathlib, struct, sys

def dec(data):
    out=bytearray(); i=0
    while i<len(data):
        c=data[i]; i+=1
        if c==128: continue
        if c<128:
            n=c+1
            if i+n>len(data): raise ValueError('truncated literal')
            out.extend(data[i:i+n]); i+=n
        else:
            n=257-c
            if i>=len(data): raise ValueError('truncated repeat')
            out.extend(bytes([data[i]])*n); i+=1
    return bytes(out)

def enc(data):
    out=bytearray(); i=0
    while i<len(data):
        run=1
        while i+run<len(data) and data[i+run]==data[i] and run<128: run+=1
        if run>=3:
            out.extend((257-run,data[i])); i+=run
        else:
            start=i; i+=run
            while i<len(data) and i-start<128:
                r=1
                while i+r<len(data) and data[i+r]==data[i] and r<128: r+=1
                if r>=3: break
                if i-start+r>128: break
                i+=r
            chunk=data[start:i]; out.append(len(chunk)-1); out.extend(chunk)
    return bytes(out)

def parse(buf):
    if buf[:4]!=b'GLIB': raise ValueError('bad GLIB signature')
    n=struct.unpack_from('>H',buf,8)[0]+1
    if n<3 or 16+4*n>len(buf): raise ValueError('bad pointer table')
    ptr=list(struct.unpack_from('>'+('I'*n),buf,16))
    if ptr[0]<16+4*n or ptr[-1] not in (len(buf),len(buf)-1) or any(a>b for a,b in zip(ptr,ptr[1:])): raise ValueError('bad GLIB bounds')
    return n,ptr,[buf[ptr[i]:ptr[i+1]] for i in range(n-1)]

def build(src, out, mode, field=''):
    b=bytearray(pathlib.Path(src).read_bytes()); n,p,m=parse(b)
    ids=m[0]; count=struct.unpack_from('>H',ids,0)[0]
    target=None
    for i in range(count):
        ident,idx=struct.unpack_from('>HH',ids,2+4*i)
        if ident==72: target=idx
    if target is None: raise ValueError('monster 72 absent')
    if mode=='aux-field':
        raw=bytearray(m[target])
        ofs,val=map(int,field.split(':'))
        raw[ofs]=val
        m[target]=bytes(raw)
    elif mode=='field':
        raw=bytearray(dec(m[target]))
        ofs,val=map(int,field.split(':'))
        raw[ofs]=val
        m[target]=enc(raw)
    elif mode=='bad-stream': m[target]=bytes([255])
    elif mode=='bad-member-meta':
        bad=bytearray(m[0])
        for i in range(struct.unpack_from('>H',bad,0)[0]):
            ident,idx=struct.unpack_from('>HH',bad,2+4*i)
            if ident==72: struct.pack_into('>HH',bad,2+4*i,ident,n+7)
        m[0]=bytes(bad)
    elif mode=='bad-container': b[0:4]=b'HLIB'; pathlib.Path(out).write_bytes(b); return
    elif mode=='oversize':
        b.extend(bytes(32769-len(b)))
        struct.pack_into('>I',b,4,len(b))
        pathlib.Path(out).write_bytes(b); return
    elif mode=='short-container': pathlib.Path(out).write_bytes(b[:len(b)-17]); return
    pad=b[-1:] if p[-1]==len(b)-1 else b''
    ptr=[0]*n; pos=16+4*n; blobs=[]
    for x in m:
        ptr[len(blobs)]=pos; blobs.append(x); pos+=len(x)
    ptr[-1]=pos+len(pad)-1 if pad else pos
    header=bytearray(b[:16]); struct.pack_into('>I',header,4,pos+len(pad))
    struct.pack_into('>H',header,8,n-1)
    with open(out,'wb') as f:
        f.write(header)
        for x in ptr: f.write(struct.pack('>I',x))
        for x in blobs: f.write(x)
        f.write(pad)

if __name__=='__main__': build(*sys.argv[1:])
'@ | Set-Content -LiteralPath $stageTool -Encoding UTF8

function New-SecretCase([string]$Name, [string]$MonMode = 'copy', [string]$Field = '', [switch]$Tree) {
  $case = Join-Path $EvidenceRoot $Name
  $caseFull = [IO.Path]::GetFullPath($case)
  $rootPrefix = $EvidenceRoot.TrimEnd('\') + '\'
  if (-not $caseFull.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to replace case path outside evidence root: $caseFull"
  }
  if (Test-Path -LiteralPath $case) { Remove-Item -LiteralPath $case -Recurse -Force }
  $cdrive = Join-Path $case 'C'
  $ddrive = Join-Path $case 'D'
  New-Item -ItemType Directory -Force $cdrive, $ddrive | Out-Null
  $dataDir = $ddrive
  if ($Tree) {
    $dataDir = Join-Path $ddrive 'DISK2'
    New-Item -ItemType Directory -Force $dataDir, (Join-Path $ddrive 'DISK1') | Out-Null
  }
  Copy-Item (Join-Path $build '*.COM') $cdrive -Force
  if ($ComPath) { Copy-Item -LiteralPath $ComPath -Destination (Join-Path $cdrive 'CCCOMBAT.COM') -Force }
  Copy-Item $ecl (Join-Path $dataDir 'ECL.GLB') -Force
  Copy-Item $geo (Join-Path $dataDir 'GEO.GLB') -Force
  Copy-Item $inventorySource (Join-Path $dataDir 'MONITM.GLB') -Force
  Copy-Item $effectsSource (Join-Path $dataDir 'MONSPC.GLB') -Force
  if ($Tree) { Copy-Item $catalogSource (Join-Path $ddrive 'DISK1\ITEMS.DAT') -Force }
  else { Copy-Item $catalogSource (Join-Path $dataDir 'ITEMS.DAT') -Force }
  if ($MonMode -eq 'copy') { Copy-Item $mon (Join-Path $dataDir 'MONCHA.GLB') -Force }
  elseif ($MonMode -eq 'aux-field') {
    Copy-Item $mon (Join-Path $dataDir 'MONCHA.GLB') -Force
    & python $stageTool $inventorySource (Join-Path $dataDir 'MONITM.GLB') $MonMode $Field
    if ($LASTEXITCODE -ne 0) { throw "Failed to stage $Name MONITM ($LASTEXITCODE)" }
  }
  else { & python $stageTool $mon (Join-Path $dataDir 'MONCHA.GLB') $MonMode $Field; if ($LASTEXITCODE -ne 0) { throw "Failed to stage $Name MONCHA ($LASTEXITCODE)" } }
  return @{ Root=$case; C=$cdrive; D=$ddrive; Data=$dataDir; Tree=[bool]$Tree; Conf=(Join-Path $case 'dosbox.conf') }
}

function Invoke-SecretCase($Case, [string]$GuestArgs, [bool]$ExpectGood, [string]$Expected = '') {
  $started = [DateTime]::UtcNow
  $confText = @"
[sdl]
fullscreen=false
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
@echo off
mount C "$($Case.C)"
mount D "$($Case.D)"
D:
$(if ($Case.Tree) { 'cd \DISK2' })
C:\GBBOOT $GuestArgs > C:\GBSECC9.TXT
exit
"@
  Set-Content -LiteralPath $Case.Conf -Value $confText -Encoding ASCII
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $Case.Conf -Headless:$Headless
  if (-not $p.WaitForExit(120000)) { Stop-DosBoxSmoke -Process $p; throw "Secret case $($Case.Root) timed out" }
  $Case.ExitCode = $p.ExitCode
  $Case.ElapsedSeconds = [Math]::Round(([DateTime]::UtcNow - $started).TotalSeconds, 2)
  $log = Join-Path $Case.C 'GBSECC9.TXT'
  if (-not (Test-Path $log)) { throw "Secret case omitted guest console: $($Case.Root)" }
  $Case.Console = Get-Content $log -Raw
  foreach ($name in @('_GBCOMB.TRC','_GBCOMB.OUT','_GBCOMB.RAW','_GBECL.TXT','_GBECL.BIN')) {
    $src=Join-Path $Case.C $name
    if (Test-Path $src) { Copy-Item $src $Case.Root -Force }
  }
  Copy-Item $log $Case.Root -Force
  @("exit=$($Case.ExitCode)", "elapsedSeconds=$($Case.ElapsedSeconds)", "guestArgs=$GuestArgs") |
    Set-Content -LiteralPath (Join-Path $Case.Root 'run.meta.txt') -Encoding ASCII
  if ($ExpectGood) {
    if ($Case.Console -like '*native preview failed*' -or $Case.Console -like '*bad effect*') { throw "Secret positive case rejected: $($Case.Root)" }
    foreach ($needle in @('Combat source: Secret Amiga normal melee (/9 1)')) {
      if ($Case.Console -notlike "*$needle*") { throw "Secret case missing source diagnostic '$needle': $($Case.Root)" }
    }
    $Case.Trace = Get-Content (Join-Path $Case.C '_GBCOMB.TRC') -Raw
    $Case.Outcome = (Get-Content (Join-Path $Case.C '_GBCOMB.OUT') -Raw).Trim()
    Assert-RawFrame (Join-Path $Case.C '_GBCOMB.RAW') "Secret profile $($Case.Root)"
    if ($Expected -and $Case.Trace -notlike "*$Expected*") { throw "Secret profile trace missing '$Expected': $($Case.Root)" }
  } else {
    if ($Case.Console -notlike '*bad effect*' -and
        $Case.Console -notlike '*native preview failed*' -and
        $Case.Console -notlike '*invalid combat source profile*') {
      throw "Secret negative case was not rejected: $($Case.Root)"
    }
    foreach ($name in @('_GBCOMB.TRC','_GBCOMB.OUT','_GBCOMB.RAW')) {
      if (Test-Path (Join-Path $Case.C $name)) { throw "Rejected Secret case wrote ${name}: $($Case.Root)" }
    }
  }
  return $Case
}

$profileBase = Invoke-SecretCase (New-SecretCase 'profile-control') '/E /X /A 16 /@33930 /9 1' $true 'attack e2 p1 12 8'
if ($profileBase.Trace -notlike '*attack p0 e0 4 9 0 - 52 -*') { throw 'Baseline Secret profile did not expose source HP52 and THAC0/AC-derived need9' }
$hpCase = Invoke-SecretCase (New-SecretCase 'mutate-hp437' 'field' '437:48') '/E /X /A 16 /@33930 /9 1' $true
if ($hpCase.Trace -notlike '*attack p0 e0 4 9 0 - 48 -*') { throw 'HP437 mutation did not change combat HP to source-derived 48' }
$thacCase = Invoke-SecretCase (New-SecretCase 'mutate-thac106' 'field' '106:47') '/E /X /A 16 /@33930 /9 1' $true
if ($thacCase.Trace -notlike '*attack e2 p1 12 7*') { throw 'THAC106 mutation did not reduce enemy needed threshold from 8 to 7' }
$armorCase = Invoke-SecretCase (New-SecretCase 'mutate-armor50' 'aux-field' '50:3') '/E /X /A 16 /@33930 /9 1' $true
if ($armorCase.Trace -notlike '*attack p0 e0 4 10 0*') { throw 'Magic armor item 50 mutation did not raise party needed threshold from 9 to 10' }
$dice2d8 = Invoke-SecretCase (New-SecretCase 'mutate-secondary-count292' 'field' '292:2') '/E /X /A 16 /@33930 /9 1' $true
$dice1d6 = Invoke-SecretCase (New-SecretCase 'mutate-secondary-sides294' 'field' '294:6') '/E /X /A 16 /@33930 /9 1' $true
$oddRate = Invoke-SecretCase (New-SecretCase 'mutate-secondary-rate290-odd' 'field' '290:3') '/E /X /A 16 /@33930 /9 1' $true
# Independent seeded-draw derivation from Secret's Pascal LCG and the native
# initiative path: CCCOMBAT seed 4660 -> seven d10 draws [8,1,8,6,10,3,5],
# leaving 0xD35FB12C before the first damage roll. Source damage_draws yields
# 1d8=2 and 2d8=6 from that state. For the 1d6 mutation the first draw is 2;
# after the following d20 values 4 (party miss) and 9 (enemy hit), damage is 6
# rather than the baseline 1d8=4. The assertions below pin those exact outcomes.
if ($dice2d8.Trace -notlike '*attack e2 p1 12 8 1 6*') {
  throw 'Secondary count292=2 did not produce the seeded 2d8 damage6 trace'
}
if ($dice1d6.Trace -notlike '*attack e0 p0 9 9 1 6*') {
  throw 'Secondary sides294=6 did not produce the seeded 1d6 damage6 trace'
}
# Retail initializes DS8DC7 to zero before the first actor-rate setup, then
# increments it only after the round. Thus rate3 gives ((3+0)&255)/2 = 1
# attack on round one and ((3+1)&255)/2 = 2 on round two. This deliberately
# odd rate exposes the parity offset that an even rate of 2 conceals.
$oddRateE2 = @($oddRate.Trace -split "`r?`n" | Where-Object { $_ -match '^\d+ attack e2 ' })
$oddRateRound1 = @($oddRateE2 | Where-Object { $_ -match '^1 attack ' }).Count
$oddRateRound2 = @($oddRateE2 | Where-Object { $_ -match '^2 attack ' }).Count
if ($oddRateRound1 -ne 1 -or $oddRateRound2 -ne 2) {
  throw "Secondary rate290=3 must use source parity 0 on round1 then1 on round2: e2 turns r1=$oddRateRound1 r2=$oddRateRound2; see $($oddRate.Root)"
}

foreach ($negative in @(
  @{Name='reject-unknown-profile'; Args='/E /X /A 16 /@33930 /9 2'; Mode='copy'},
  @{Name='reject-duplicate-profile'; Args='/E /X /A 16 /@33930 /9 1 /9 1'; Mode='copy'},
  @{Name='reject-truncated-monster-rle'; Args='/E /X /A 16 /@33930 /9 1'; Mode='bad-stream'},
  @{Name='reject-member-id-metadata'; Args='/E /X /A 16 /@33930 /9 1'; Mode='bad-member-meta'},
  @{Name='reject-bad-container'; Args='/E /X /A 16 /@33930 /9 1'; Mode='bad-container'},
  @{Name='reject-short-container'; Args='/E /X /A 16 /@33930 /9 1'; Mode='short-container'},
  @{Name='reject-oversize-container'; Args='/E /X /A 16 /@33930 /9 1'; Mode='oversize'}
)) {
  $case=New-SecretCase $negative.Name $negative.Mode
  Invoke-SecretCase $case $negative.Args $false | Out-Null
}

$missingAux = New-SecretCase 'reject-missing-effects'
Remove-Item -LiteralPath (Join-Path $missingAux.Data 'MONSPC.GLB') -Force
Invoke-SecretCase $missingAux '/E /X /A 16 /@33930 /9 1' $false | Out-Null
$validFallback = New-SecretCase 'valid-sibling-catalog-fallback' 'copy' '' -Tree
Invoke-SecretCase $validFallback '/E /X /A 16 /@33930 /9 1' $true | Out-Null
$badPrimary = New-SecretCase 'reject-malformed-primary-with-valid-fallback' 'copy' '' -Tree
[IO.File]::WriteAllBytes((Join-Path $badPrimary.Data 'ITEMS.DAT'), [byte[]](1,2,3))
Invoke-SecretCase $badPrimary '/E /X /A 16 /@33930 /9 1' $false | Out-Null

# GBBOOT's /P is a party-count input, not CCCOMBAT's GBPR path option. Exercise
# CCCOMBAT directly so the Secret profile's unsupported roster-schema guard is
# actually reached with a deliberately foreign HLIB/DAX-style party file.
$foreignParty = New-SecretCase 'reject-foreign-hlib-party-standalone'
Copy-Item (Join-Path $profileBase.C '_GBECL.BIN') (Join-Path $foreignParty.C '_GBECL.BIN') -Force
[IO.File]::WriteAllBytes((Join-Path $foreignParty.C 'FOREIGN.GBP'), [byte[]](0x48,0x4c,0x49,0x42,0,0,0,0))
$standaloneConf = @"
[sdl]
fullscreen=false
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
@echo off
mount C "$($foreignParty.C)"
mount D "$($foreignParty.D)"
C:\CCCOMBAT /E C:\_GBECL.BIN D:\MONCHA.GLB 4660 C:\FOREIGN.TRC C:\FOREIGN.OUT C:\FOREIGN.RAW /9 1 /P C:\FOREIGN.GBP > C:\CCSTAND.TXT
exit
"@
Set-Content -LiteralPath $foreignParty.Conf -Value $standaloneConf -Encoding ASCII
$standalone = Start-DosBoxSmoke -Dosbox $dosbox -Conf $foreignParty.Conf -Headless:$Headless
if (-not $standalone.WaitForExit(60000)) { Stop-DosBoxSmoke -Process $standalone; throw 'Standalone Secret foreign-GBPR guard timed out' }
$foreignPartyExit = $standalone.ExitCode
$foreignConsole = Get-Content (Join-Path $foreignParty.C 'CCSTAND.TXT') -Raw
if ($foreignConsole -notlike '*bad effect*' -and $foreignConsole -notlike '*invalid*') {
  throw "Standalone Secret profile accepted the foreign /P record (exit=$foreignPartyExit)"
}
foreach ($artifact in @('FOREIGN.TRC','FOREIGN.OUT','FOREIGN.RAW')) {
  if (Test-Path (Join-Path $foreignParty.C $artifact)) { throw "Foreign GBPR rejection wrote $artifact" }
}
Set-Content -LiteralPath (Join-Path $foreignParty.Root 'standalone-console.txt') -Value $foreignConsole -Encoding ASCII
Set-Content -LiteralPath (Join-Path $foreignParty.Root 'standalone.meta.txt') -Value "exit=$foreignPartyExit`nguestArgs=/E ... /9 1 /P C:\FOREIGN.GBP" -Encoding ASCII

$rngConflict = New-SecretCase 'reject-cok-rng-protocol-standalone'
Copy-Item (Join-Path $profileBase.C '_GBECL.BIN') (Join-Path $rngConflict.C '_GBECL.BIN') -Force
$rngConfText = @"
[sdl]
fullscreen=false
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
@echo off
mount C "$($rngConflict.C)"
mount D "$($rngConflict.D)"
C:\CCCOMBAT /E C:\_GBECL.BIN D:\MONCHA.GLB 4660 C:\RNG.TRC C:\RNG.OUT C:\RNG.RAW /R C:\RNG.GBR /9 1 /J > C:\CCSTAND.TXT
exit
"@
Set-Content -LiteralPath $rngConflict.Conf -Value $rngConfText -Encoding ASCII
$rngProcess = Start-DosBoxSmoke -Dosbox $dosbox -Conf $rngConflict.Conf -Headless:$Headless
if (-not $rngProcess.WaitForExit(60000)) { Stop-DosBoxSmoke -Process $rngProcess; throw 'Standalone Secret /J conflict guard timed out' }
$rngExit = $rngProcess.ExitCode
$rngConsole = Get-Content (Join-Path $rngConflict.C 'CCSTAND.TXT') -Raw
if ($rngConsole -notlike '*bad effect*') { throw "Standalone Secret profile accepted conflicting /J (exit=$rngExit)" }
foreach ($artifact in @('RNG.TRC','RNG.OUT','RNG.RAW','RNG.GBR')) {
  if (Test-Path (Join-Path $rngConflict.C $artifact)) { throw "Secret /J conflict rejection wrote $artifact" }
}
Set-Content -LiteralPath (Join-Path $rngConflict.Root 'standalone-console.txt') -Value $rngConsole -Encoding ASCII
Set-Content -LiteralPath (Join-Path $rngConflict.Root 'standalone.meta.txt') -Value "exit=$rngExit`nguestArgs=/E ... /R C:\RNG.GBR /9 1 /J" -Encoding ASCII

Write-Output "EVIDENCE: Secret profile /9 1 cases at $EvidenceRoot"

# Stop a real six-player combat after result close and before host completion.
# Cold recovery must finish that exact VM continuation and preserve P1, without
# replaying the completed battle. Durable GSK plus its owned GKW marker travel
# together; copying only legacy HP transaction files does not test recovery.
$ownedCapture = New-SecretCase 'owned-completion-capture'
foreach ($slot in 1..6) {
  foreach ($extension in @('SAV','STF','SFX')) {
    $source = Join-Path $SecretDosPath "CHRDATA$slot.$extension"
    if (Test-Path -LiteralPath $source -PathType Leaf) {
      Copy-Item -LiteralPath $source -Destination $ownedCapture.Data -Force
    }
  }
}
$testNasm = (Get-Command nasm -ErrorAction SilentlyContinue).Source
if (-not $testNasm) { $testNasm = Join-Path $env:LOCALAPPDATA 'bin\NASM\nasm.exe' }
& $testNasm -I ($native + '\src\') -f bin -DGBBOOT_TEST_SECRET_STOP_AFTER_RESULT=1 `
  (Join-Path $native 'src\gbboot.asm') -o (Join-Path $ownedCapture.C 'GBBOOT.COM')
if ($LASTEXITCODE -ne 0) { throw 'Secret stop-after-result fixture assembly failed' }
@'
@echo off
C:\GBBOOT /E /X /A 16 /@33930 /9 1 > C:\CAPTURE.TXT
if errorlevel 89 goto failed
if errorlevel 88 goto stopped
:failed
echo FAIL > C:\CAPTURE.BAD
goto done
:stopped
echo PASS > C:\CAPTURE.OK
:done
'@ | Set-Content -LiteralPath (Join-Path $ownedCapture.C 'CAPTURE.BAT') -Encoding ASCII
@"
[sdl]
fullscreen=false
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$($ownedCapture.C)"
mount D "$($ownedCapture.D)"
D:
call C:\CAPTURE.BAT
exit
"@ | Set-Content -LiteralPath $ownedCapture.Conf -Encoding ASCII
$captureProcess = Start-DosBoxSmoke -Dosbox $dosbox -Conf $ownedCapture.Conf -Headless:$Headless
$captureProcess.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::Normal
$capturePid = $captureProcess.Id
if (-not $captureProcess.WaitForExit(120000)) { Stop-DosBoxSmoke -Process $captureProcess; throw 'Owned Secret capture timed out' }
if ($captureProcess.ExitCode -ne 0 -or -not (Test-Path (Join-Path $ownedCapture.C 'CAPTURE.OK')) -or
    (Test-Path (Join-Path $ownedCapture.C 'CAPTURE.BAD'))) { throw 'Owned Secret capture did not stop at guest exit88' }

function Invoke-SecretOwnedBoot($Case, [string]$Label,
    [string]$GuestArgs = '/E /X /A 16 /@33930 /9 1') {
  $started = [DateTime]::UtcNow
  foreach ($name in @('OWNED.OK','OWNED.BAD')) {
    Remove-Item -LiteralPath (Join-Path $Case.C $name) -Force -ErrorAction SilentlyContinue
  }
  @"
@echo off
C:\GBBOOT $GuestArgs > C:\GBSECC9.TXT
if errorlevel 1 goto failed
echo PASS > C:\OWNED.OK
goto done
:failed
echo FAIL > C:\OWNED.BAD
:done
"@ | Set-Content -LiteralPath (Join-Path $Case.C 'OWNED.BAT') -Encoding ASCII
  @"
[sdl]
fullscreen=false
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$($Case.C)"
mount D "$($Case.D)"
D:
call C:\OWNED.BAT
exit
"@ | Set-Content -LiteralPath $Case.Conf -Encoding ASCII
  $process = Start-DosBoxSmoke -Dosbox $dosbox -Conf $Case.Conf -Headless:$Headless
  $process.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::Normal
  $processPid = $process.Id
  if (-not $process.WaitForExit(120000)) {
    Stop-DosBoxSmoke -Process $process
    throw "Owned Secret production boot timed out: $($Case.Root)"
  }
  if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $Case.C 'OWNED.OK')) -or
      (Test-Path -LiteralPath (Join-Path $Case.C 'OWNED.BAD'))) {
    throw "Owned Secret production boot failed its guest exit0 check: $($Case.Root)"
  }
  $console = Get-Content -LiteralPath (Join-Path $Case.C 'GBSECC9.TXT') -Raw
  if ($console -like '*native preview failed*' -or $console -like '*bad effect*') {
    throw "Owned Secret production boot rejected: $($Case.Root)"
  }
  Copy-Item -LiteralPath (Join-Path $Case.C 'GBSECC9.TXT') `
    -Destination (Join-Path $Case.Root "$Label-console.txt") -Force
  @("pid=$processPid", 'priority=Normal', "hostExit=$($process.ExitCode)", 'guestExit=0',
    "elapsedSeconds=$([Math]::Round(([DateTime]::UtcNow - $started).TotalSeconds, 2))") |
    Set-Content -LiteralPath (Join-Path $Case.Root "$Label.meta.txt") -Encoding ASCII
}

$ownedReference = New-SecretCase 'owned-completion-uninterrupted'
foreach ($slot in 1..6) {
  foreach ($extension in @('SAV','STF','SFX')) {
    $source = Join-Path $SecretDosPath "CHRDATA$slot.$extension"
    if (Test-Path -LiteralPath $source -PathType Leaf) {
      Copy-Item -LiteralPath $source -Destination $ownedReference.Data -Force
    }
  }
}
Invoke-SecretOwnedBoot $ownedReference 'uninterrupted'

$ownedCold = New-SecretCase 'owned-completion-cold'
foreach ($entry in Get-ChildItem -LiteralPath $ownedCapture.C -Force) {
  Copy-Item -LiteralPath $entry.FullName -Destination $ownedCold.C -Recurse -Force
}
# The captured root GBBOOT is the STOP88 fixture. Restage all production root
# tools after the recursive state copy; preserve nested durable workspace data.
foreach ($tool in Get-ChildItem -LiteralPath $build -Filter '*.COM' -File) {
  Copy-Item -LiteralPath $tool.FullName -Destination $ownedCold.C -Force
}
if ($ComPath) { Copy-Item -LiteralPath $ComPath -Destination (Join-Path $ownedCold.C 'CCCOMBAT.COM') -Force }
foreach ($name in @('_GBPARTY.GSK','_GBPARTY.GKW\OWNER.BIN','_GBECL.IDN','_GBSEED.BIN')) {
  if (-not (Test-Path -LiteralPath (Join-Path $ownedCold.C $name) -PathType Leaf)) {
    throw "Cold Secret clone omitted durable state: $name"
  }
}
if ((Get-FileHash -LiteralPath (Join-Path $ownedCold.C 'GBBOOT.COM')).Hash -ne
    (Get-FileHash -LiteralPath (Join-Path $build 'GBBOOT.COM')).Hash) {
  throw 'Cold Secret clone retained the STOP88 GBBOOT instead of production'
}
Remove-Item -LiteralPath (Join-Path $ownedCold.Data 'ITEMS.DAT') -Force
$verifyOwned = Join-Path $EvidenceRoot 'verify-owned-completion.py'
@'
import hashlib, pathlib, struct, sys
before, after, reference, repository = map(pathlib.Path, sys.argv[1:5])
sys.path.insert(0, str(repository))
from tools.secret_continuation import Phase, decode, source_member
from tools.secret_random import ecl_random
p0 = (before/'_GBPARTY.GBP').read_bytes()
r0 = (before/'_GBCR.BIN').read_bytes()
gsc = (before/'_GBPARTY.GSC').read_bytes()
request = next(before.glob('_GBRESUL*.BIN')).read_bytes()
prepared = decode((before/'_GBPARTY.GSK').read_bytes())
assert prepared.phase == Phase.PREPARED and prepared.resume_kind == 0
assert prepared.part('roster') == p0 and prepared.part('request') == request
assert (before/'_GBPARTY.GKW'/'OWNER.BIN').is_file()
assert struct.unpack_from('<4s6H', r0)[:2] == (b'GBCR',3)
assert struct.unpack_from('<H',r0,10)[0] == 6 and struct.unpack_from('<H',r0,14)[0] == 0
assert len(r0) == 52+len(p0) and r0[52:] == p0
assert gsc == struct.pack('<4sHH',b'GSC1',1,len(p0))+request+p0
assert all(not list(before.glob('*.'+ext)) for ext in ('GSJ','GSB','GST','GSN'))
p1 = bytearray(p0)
for i in range(6):
    hp, maximum = struct.unpack_from('<HH',r0,18+i*6)
    assert maximum == p0[17+i*440+112] and hp <= maximum
    p1[17+i*440+437] = hp
assert bytes(p1) != p0
active = decode((after/'_GBPARTY.GSK').read_bytes())
uninterrupted = decode((reference/'_GBPARTY.GSK').read_bytes())
assert active.phase == uninterrupted.phase == Phase.ACTIVE
assert active.resume_kind == uninterrupted.resume_kind == 0
terminal = active.part('successor')
assert terminal == uninterrupted.part('successor'), 'cold VM successor differs from uninterrupted execution'
assert len(terminal) == 5948 and struct.unpack_from('<H',terminal,4)[0] == 16
assert struct.unpack_from('<H',terminal,8)[0] == 0
assert struct.unpack_from('<HH',terminal,122) == (16,0x04A5)
legacy = bytearray(terminal[:5750]); struct.pack_into('<H',legacy,4,9)
assert hashlib.sha256(legacy).hexdigest() == '345c2bb89a1df6edf31b18fc6f3d434afb2e9fbcef2c754cfdad75c8ed71c1d8'
# Task247: check the held post-combat RANDOM99 against the independently
# original-proven recurrence. Secret combat does not change this ECL seed.
paused = prepared.part('paused')
assert struct.unpack_from('<H',paused,8)[0] == 3
assert struct.unpack_from('<H',paused,120)[0] == 13
assert struct.unpack_from('<H',paused,124)[0] == 0x492
assert struct.unpack_from('<I',paused,126)[0] == 0x1234
assert source_member(prepared.part('identity')[16:],16)[0x492:0x498] == bytes.fromhex('08 00 63 01 79 7f')
value, next_seed = ecl_random(0x1234,99)
assert (value,next_seed) == (7,0x3B032B05)
assert struct.unpack_from('<H',terminal,120)[0] == 12
assert struct.unpack_from('<I',terminal,126)[0] == next_seed
assert struct.unpack_from('<H',terminal,196)[0] == 2
assert struct.unpack_from('<HH',terminal,198) == (0x7F79,0x4C2C)
assert struct.unpack_from('<HH',terminal,1222) == (value,0)
# Retain the previous complete golden: only paired semantics, seed and the
# RANDOM destination differ. Unrelated bytes cannot be hidden by repinning.
old_rng = bytearray(legacy)
struct.pack_into('<H',old_rng,120,4)
struct.pack_into('<I',old_rng,126,0x0AC49803)
struct.pack_into('<H',old_rng,1222,40)
assert hashlib.sha256(old_rng).hexdigest() == 'c51e75d0777f64f7eb875c8d15c36b629205708cc791cfb9d526041133dab9b9'
assert terminal[5750:5774] == bytes(24)
assert struct.unpack_from('<4s4H',terminal,5774) == (b'GBMS',value,90,0,0)
assert terminal[5786:5920] == bytes(134)
assert terminal[5920:5932] == b'GBRF'+bytes((0,1,1,0,1,0))+bytes(2)
assert struct.unpack_from('<4s6H',terminal,5932) == (b'GBSI',1,16,0,0,6,0)
assert (after/'_GBRES.BIN').read_bytes() == terminal
assert (reference/'_GBRES.BIN').read_bytes() == terminal
assert (after/'_GBPARTY.GBP').read_bytes() == bytes(p1)
assert (reference/'_GBPARTY.GBP').read_bytes() == bytes(p1)
r1 = (after/'_GBCR.BIN').read_bytes()
assert r1 == r0[:14]+b'\1\0'+r0[16:], 'cold boot replaced the completed result with a replayed battle'
assert r1[52:] == p0, 'cold result must retain the original P0 battle preimage'
assert active.part('result') == uninterrupted.part('result') == r0
assert active.part('paused') == prepared.part('paused')
assert (after/'_GBSEED.BIN').read_bytes() == (before/'_GBSEED.BIN').read_bytes()
for name in ('_GBCOMB.TRC','_GBCOMB.RAW'):
    assert (after/name).read_bytes() == (before/name).read_bytes(), f'cold boot replayed combat artifact {name}'
assert all(not list(after.glob('*.'+ext)) for ext in ('GSC','GSD','GSJ','GSB','GST','GSN','GKB','GKT'))
print('owned Secret durable cold continuation equals uninterrupted VM/P1 without combat replay PASS')
'@ | Set-Content -LiteralPath $verifyOwned -Encoding ASCII
Invoke-SecretOwnedBoot $ownedCold 'cold-first'
& python $verifyOwned $ownedCapture.C $ownedCold.C $ownedReference.C $root
if ($LASTEXITCODE -ne 0) { throw 'Owned Secret completed-result recovery verification failed' }

$repeatHashes = @{}
foreach ($name in @('_GBPARTY.GSK','_GBPARTY.GBP','_GBCR.BIN','_GBRES.BIN','_GBSEED.BIN','_GBCOMB.TRC','_GBCOMB.RAW')) {
  $repeatHashes[$name] = (Get-FileHash -LiteralPath (Join-Path $ownedCold.C $name) -Algorithm SHA256).Hash
}
Invoke-SecretOwnedBoot $ownedCold 'cold-repeat'
foreach ($name in $repeatHashes.Keys) {
  if ((Get-FileHash -LiteralPath (Join-Path $ownedCold.C $name) -Algorithm SHA256).Hash -ne $repeatHashes[$name]) {
    throw "Repeated cold Secret boot changed acknowledged artifact: $name"
  }
}
& python $verifyOwned $ownedCapture.C $ownedCold.C $ownedReference.C $root
if ($LASTEXITCODE -ne 0) { throw 'Repeated cold Secret continuation verification failed' }
Write-Output 'RESULT: Secret completed result settles once; cold and repeated boot retain exact uninterrupted terminal VM/P1 PASS'

# Task240: distinguish the whole INPUT_NUMBER reply from an eight-bit menu
# index through actual mutually exclusive ECL branches. IF_EQ guards exactly
# one following GOTO; its word target is a Gen2 virtual address (base8000).
$numericFixture = Join-Path $EvidenceRoot 'numeric-branch.GLB'
$numericGenerator = Join-Path $EvidenceRoot 'build-numeric-branch.py'
@'
import hashlib, json, pathlib, struct, sys
p=bytearray(20)
def word(n): return b'\x02'+struct.pack('<H',n)
def ref(n): return b'\x03'+struct.pack('<H',n)
def marker(key,value): p.extend(b'\x09'+word(value)+ref(key))
marker(0x0101,0x1111)
p.extend(b'\x1c\x0b\x00\x48\x00\x05\x00\x48\x24')
first_pause=len(p)
p.extend(b'\x0f\x00\x00'+ref(0x0120))
number_pause=len(p)
p.extend(b'\x03'+ref(0x0120)+word(1234)+b'\x16')
correct_jump=len(p);p.extend(b'\x01'+word(0))
bad_pc=len(p);marker(0x0103,0x3333)
end_jump=len(p);p.extend(b'\x01'+word(0))
good_pc=len(p);marker(0x0102,0x2222)
terminal_pc=len(p);p.append(0)
for at,target in ((correct_jump,good_pc),(end_jump,terminal_pc)):
    struct.pack_into('<H',p,at+2,0x8000+target)
index=struct.pack('>3H',1,16,1)
first=28+len(index);end=first+len(p)
blob=b'GLIB'+struct.pack('>IHBB',end,2,0,1)+b'GLIB'
blob+=struct.pack('>3I',28,first,end)+index+p
digest=hashlib.sha256(blob).hexdigest()
assert len(blob)==107 and digest=='01e9d5475a15ea9ab35bc5fe7b9ca3d77e5bb4ca78d1a73192011797a31e5eab'
assert (first_pause,number_pause,good_pc,bad_pc,terminal_pc)==(0x24,0x2a,0x41,0x36,0x48)
output=pathlib.Path(sys.argv[1]);output.write_bytes(blob)
output.with_suffix('.json').write_text(json.dumps(dict(sha256=digest,entry=0x8014,
    firstPausePc=first_pause,numberPausePc=number_pause,terminalPc=terminal_pc,
    correctMarkerPc=good_pc,otherMarkerPc=bad_pc,classification='synthetic ECL; genuine Secret combat inputs'),indent=2))
'@ | Set-Content -LiteralPath $numericGenerator -Encoding ASCII
& python $numericGenerator $numericFixture
if ($LASTEXITCODE -ne 0) { throw 'Numeric branch fixture generation failed' }

$verifyNumeric = Join-Path $EvidenceRoot 'verify-numeric-branch.py'
@'
import hashlib, pathlib, struct, sys
directory,repository=map(pathlib.Path,sys.argv[1:3]);answer=int(sys.argv[3]);mode=sys.argv[4]
sys.path.insert(0,str(repository))
from tools.secret_continuation import Phase,decode,projected_roster
record=decode((directory/'_GBPARTY.GSK').read_bytes())
assert record.phase==Phase.ACTIVE
fx=record.part('successor')
assert (directory/'_GBRES.BIN').read_bytes()==fx
assert hashlib.sha256(record.part('identity')[16:]).hexdigest()=='01e9d5475a15ea9ab35bc5fe7b9ca3d77e5bb4ca78d1a73192011797a31e5eab'
assert len(fx)==5948 and struct.unpack_from('<H',fx,4)[0]==16
assert struct.unpack_from('<4s6H',fx,5932)==(b'GBSI',1,16,0,0,6,0)
if mode=='closed':
    assert record.resume_kind==0
    assert struct.unpack_from('<H',fx,8)[0]==2
    assert struct.unpack_from('<HH',fx,122)==(16,0x2a)
    assert struct.unpack_from('<HHH',fx,5756)==(0x0120,0,0x0f)
    token=(directory/'_GBCOMB.OUT').read_bytes()
    identity=struct.unpack_from('<4H',fx,5766)
    assert token==struct.pack('<4s7H',b'GBMO',2,answer,0,*identity)
    assert (directory/'_GBPARTY.GBP').read_bytes()==projected_roster(record,record.part('result'))
else:
    assert record.resume_kind==1
    assert struct.unpack_from('<H',fx,8)[0]==0
    assert struct.unpack_from('<HH',fx,122)==(16,0x48)
    token=record.part('outcome')
    assert struct.unpack_from('<4s3H',token)==(b'GBMO',2,answer,0)
    count=struct.unpack_from('<H',fx,196)[0]
    memory=dict(zip(struct.unpack_from('<'+'H'*count,fx,198),struct.unpack_from('<'+'H'*count,fx,1222)))
    assert memory.get(0x0101)==0x1111 and memory.get(0x0120)==answer
    if answer==1234:
        assert memory.get(0x0102)==0x2222 and 0x0103 not in memory
    else:
        assert memory.get(0x0103)==0x3333 and 0x0102 not in memory
    assert (directory/'_GBPARTY.GBP').read_bytes()==record.part('roster')
    assert not (directory/'_GBCOMB.OUT').exists(), 'acknowledged original numeric answer survived'
print(f'numeric branch {mode} value={answer} PASS')
'@ | Set-Content -LiteralPath $verifyNumeric -Encoding ASCII

function New-SecretNumericCase([string]$Name) {
  $case = New-SecretCase $Name
  Copy-Item -LiteralPath $numericFixture -Destination (Join-Path $case.Data 'ECL.GLB') -Force
  foreach ($slot in 1..6) {
    foreach ($extension in @('SAV','STF','SFX')) {
      $source = Join-Path $SecretDosPath "CHRDATA$slot.$extension"
      if (Test-Path -LiteralPath $source -PathType Leaf) {
        Copy-Item -LiteralPath $source -Destination $case.Data -Force
      }
    }
  }
  return $case
}

$numericReference = $null
foreach ($width in @(
  @{Value=0; Option='/C 0'}, @{Value=1; Option='/C1'},
  @{Value=255; Option='/C 255'}, @{Value=256; Option='/C256'},
  @{Value=1234; Option='/C 1234'}, @{Value=32768; Option='/C32768'},
  @{Value=65535; Option='/C 65535'}
)) {
  $case = New-SecretNumericCase "numeric-width-$($width.Value)"
  Invoke-SecretOwnedBoot $case 'numeric-width' "/E /X /! /A 16 /@32788 /9 1 $($width.Option)"
  & python $verifyNumeric $case.C $root $width.Value 'terminal'
  if ($LASTEXITCODE -ne 0) { throw "Numeric full-word width failed: $($width.Value)" }
  if ($width.Value -eq 1234) { $numericReference = $case }
}

# Close the actual producer answer before CCNEXT/M. First use the existing
# STOP88 physical-result boundary, then settle/resume through real CCNEXT/C
# until numeric MENU, and call real CCMENU/S1234. No synthetic GSK is authored.
$numericClosed = New-SecretNumericCase 'numeric-closed-answer'
Copy-Item -LiteralPath (Join-Path $ownedCapture.C 'GBBOOT.COM') `
  -Destination (Join-Path $numericClosed.C 'GBBOOT.COM') -Force
@'
@echo off
C:\GBBOOT /E /X /! /A 16 /@32788 /9 1 > C:\NUMCAP.TXT
if errorlevel 89 goto failed
if errorlevel 88 goto completed
goto failed
:completed
C:\CCNEXT /C C:\_GBPARTY.GBP D:\ECL.GLB C:\_GBNEXT.BIN > C:\NUMNEXT.TXT
if errorlevel 3 goto failed
if errorlevel 2 goto menu
goto failed
:menu
C:\CCMENU C:\_GBRES.BIN C:\_GBCOMB.OUT /S1234 > C:\NUMMENU.TXT
if errorlevel 1 goto failed
echo PASS > C:\NUMCAP.OK
goto done
:failed
echo FAIL > C:\NUMCAP.BAD
:done
'@ | Set-Content -LiteralPath (Join-Path $numericClosed.C 'NUMCAP.BAT') -Encoding ASCII
@"
[sdl]
fullscreen=false
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$($numericClosed.C)"
mount D "$($numericClosed.D)"
D:
call C:\NUMCAP.BAT
exit
"@ | Set-Content -LiteralPath $numericClosed.Conf -Encoding ASCII
$numericProcess = Start-DosBoxSmoke -Dosbox $dosbox -Conf $numericClosed.Conf -Headless:$Headless
if (-not $numericProcess.WaitForExit(120000)) {
  Stop-DosBoxSmoke -Process $numericProcess
  throw 'Closed numeric answer capture timed out'
}
if ($numericProcess.ExitCode -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $numericClosed.C 'NUMCAP.OK')) -or
    (Test-Path -LiteralPath (Join-Path $numericClosed.C 'NUMCAP.BAD'))) {
  throw 'Closed numeric answer capture failed exact guest88/2/0 checks'
}
& python $verifyNumeric $numericClosed.C $root 1234 'closed'
if ($LASTEXITCODE -ne 0) { throw 'Actual closed numeric producer answer was not full-word1234' }

$numericCold = New-SecretNumericCase 'numeric-closed-answer-cold'
foreach ($entry in Get-ChildItem -LiteralPath $numericClosed.C -Force) {
  Copy-Item -LiteralPath $entry.FullName -Destination $numericCold.C -Recurse -Force
}
foreach ($tool in Get-ChildItem -LiteralPath $build -Filter '*.COM' -File) {
  Copy-Item -LiteralPath $tool.FullName -Destination $numericCold.C -Force
}
if ($ComPath) { Copy-Item -LiteralPath $ComPath -Destination (Join-Path $numericCold.C 'CCCOMBAT.COM') -Force }
foreach ($slot in 1..6) {
  foreach ($extension in @('SAV','STF','SFX')) {
    Remove-Item -LiteralPath (Join-Path $numericCold.Data "CHRDATA$slot.$extension") -Force -ErrorAction SilentlyContinue
  }
}
Remove-Item -LiteralPath (Join-Path $numericCold.Data 'ITEMS.DAT') -Force
# Deliberately different /C0 must not replace the already closed answer1234.
Invoke-SecretOwnedBoot $numericCold 'numeric-cold' '/E /X /! /A 16 /@32788 /9 1 /C0'
& python $verifyNumeric $numericCold.C $root 1234 'terminal'
if ($LASTEXITCODE -ne 0) { throw 'Cold numeric closed-answer acknowledgement failed' }
foreach ($name in @('_GBRES.BIN','_GBPARTY.GBP')) {
  if ((Get-FileHash -LiteralPath (Join-Path $numericCold.C $name)).Hash -ne
      (Get-FileHash -LiteralPath (Join-Path $numericReference.C $name)).Hash) {
    throw "Cold numeric successor differs from uninterrupted1234: $name"
  }
}
foreach ($name in @('_GBCR.BIN','_GBCOMB.TRC','_GBCOMB.RAW','_GBSEED.BIN')) {
  if ((Get-FileHash -LiteralPath (Join-Path $numericCold.C $name)).Hash -ne
      (Get-FileHash -LiteralPath (Join-Path $numericClosed.C $name)).Hash) {
    throw "Cold numeric acknowledgement replayed or changed combat: $name"
  }
}
$numericRepeatHashes = @{}
foreach ($name in @('_GBPARTY.GSK','_GBPARTY.GBP','_GBCR.BIN','_GBRES.BIN','_GBCOMB.TRC','_GBCOMB.RAW','_GBSEED.BIN')) {
  $numericRepeatHashes[$name] = (Get-FileHash -LiteralPath (Join-Path $numericCold.C $name)).Hash
}
Invoke-SecretOwnedBoot $numericCold 'numeric-repeat' '/E /X /! /A 16 /@32788 /9 1 /C0'
foreach ($name in $numericRepeatHashes.Keys) {
  if ((Get-FileHash -LiteralPath (Join-Path $numericCold.C $name)).Hash -ne $numericRepeatHashes[$name]) {
    throw "Repeated numeric terminal boot changed acknowledged artifact: $name"
  }
}
Write-Output 'RESULT: INPUT_NUMBER full-word seven widths and closed1234 cold/repeated branch continuation PASS'

# Task241: the descriptor owns effective frontend scalars, independently from
# GBPS party lists. W is retained unsupported context here; this Secret-long program consumes
# L/C/Y/Z/O directly using complete source-compatible operand frames.
$contextFixture = Join-Path $EvidenceRoot 'all-context.GLB'
$contextGenerator = Join-Path $EvidenceRoot 'build-all-context.py'
@'
import hashlib, pathlib, struct, sys
def word(n):return b'\x02'+struct.pack('<H',n)
def ref(n):return b'\x03'+struct.pack('<H',n)
def string(text):
    values=[ord(c)-64 if ord(c)>31 else ord(c) for c in text]+[0]
    bits=''.join(f'{value&63:06b}' for value in values)
    bits+='0'*((-len(bits))%8)
    raw=bytes(int(bits[i:i+8],2) for i in range(0,len(bits),8))
    return bytes((0x80,len(raw)))+raw
p=bytearray(20)
p.extend(b'\x09'+word(0x1111)+ref(0x0101))
p.extend(b'\x1c\x0b\x00\x48\x00\x05\x00\x48\x24')
p.extend(b'\x0f\x00\x00'+ref(0x0120))
p.extend(b'\x15'+ref(0x0121)+string('PICK ONE')+b'\x00\x03')
for item in ('A','B','C'):p.extend(string(item))
# Secret-long PARLAY writes the selected attitude value; strength writes a
# destination, and ENCOUNTER_MENU consumes its complete fourteen-operand frame.
p.extend(b'\x2c'+b''.join(word(n) for n in range(5))+ref(0x0122))
p.extend(b'\x1d'+ref(0x0123))
p.extend(b'\x29'+word(0)+word(0)+word(0)+ref(0x0124))
p.extend(b''.join(word(n) for n in range(5)))
p.extend(word(0)*3+word(0)+word(255)+b'\x00')
index=struct.pack('>3H',1,16,1);first=28+len(index);end=first+len(p)
blob=b'GLIB'+struct.pack('>IHBB',end,2,0,1)+b'GLIB'+struct.pack('>3I',28,first,end)+index+p
assert len(blob)==170
assert hashlib.sha256(blob).hexdigest()=='911390a64c13ef8abde6cf037aec926f0451df3bb5046f1d1481e25bc6c88cb5'
pathlib.Path(sys.argv[1]).write_bytes(blob)
'@ | Set-Content -LiteralPath $contextGenerator -Encoding ASCII
& python $contextGenerator $contextFixture
if ($LASTEXITCODE -ne 0) { throw 'All-context fixture generation failed' }

$verifyContext = Join-Path $EvidenceRoot 'verify-all-context.py'
@'
import hashlib, pathlib, struct, sys
directory,repository=map(pathlib.Path,sys.argv[1:3]);mode=sys.argv[3]
sys.path.insert(0,str(repository))
from tools.secret_continuation import Context,Phase,decode,projected_roster
record=decode((directory/'_GBPARTY.GSK').read_bytes())
expected=Context(flags=127,z=88,l=1234,c=2,y=3,o=2,w=5,host_answer=2)
assert record.context==expected and record.interactive is False
source=record.part('identity')[16:]
assert hashlib.sha256(source).hexdigest()=='911390a64c13ef8abde6cf037aec926f0451df3bb5046f1d1481e25bc6c88cb5'
if mode=='capture':
    assert record.phase==Phase.PREPARED and record.resume_kind==0
    assert (directory/'_GBPARTY.GBP').read_bytes()==record.part('roster')
    assert struct.unpack_from('<H',(directory/'_GBCR.BIN').read_bytes(),14)[0]==0
else:
    assert record.phase==Phase.ACTIVE and record.resume_kind==0
    fx=record.part('successor')
    assert (directory/'_GBRES.BIN').read_bytes()==fx
    assert struct.unpack_from('<H',fx,8)[0]==0
    assert struct.unpack_from('<HH',fx,122)==(16,135)
    count=struct.unpack_from('<H',fx,196)[0]
    memory=dict(zip(struct.unpack_from('<'+'H'*count,fx,198),struct.unpack_from('<'+'H'*count,fx,1222)))
    assert (memory[0x0120],memory[0x0121],memory[0x0122])==(1234,2,3)
    events=[struct.unpack_from('<10H',fx,2252+i*20) for i in range(struct.unpack_from('<H',fx,2250)[0])]
    strengths=[row for row in events if row[0]==0x1d]
    assert len(strengths)==1 and strengths[0][1:3]==(1,0x0123)
    assert memory[0x0123]==88 and memory[0x0124]==0
    assert (directory/'_GBPARTY.GBP').read_bytes()==projected_roster(record,record.part('result'))
    assert (directory/'_GBPARTY.GKW'/'SRC.GLB').read_bytes()==source
print(f'all-context {mode} saved scalars/source alias PASS')
'@ | Set-Content -LiteralPath $verifyContext -Encoding ASCII

function New-SecretContextCase([string]$Name) {
  $case = New-SecretNumericCase $Name
  Copy-Item -LiteralPath $contextFixture -Destination (Join-Path $case.Data 'ECL.GLB') -Force
  return $case
}
function Copy-SecretDurableContext($From, [string]$Name) {
  $case = New-SecretContextCase $Name
  foreach ($entry in Get-ChildItem -LiteralPath $From.C -Force) {
    Copy-Item -LiteralPath $entry.FullName -Destination $case.C -Recurse -Force
  }
  foreach ($tool in Get-ChildItem -LiteralPath $build -Filter '*.COM' -File) {
    Copy-Item -LiteralPath $tool.FullName -Destination $case.C -Force
  }
  if ($ComPath) { Copy-Item -LiteralPath $ComPath -Destination (Join-Path $case.C 'CCCOMBAT.COM') -Force }
  foreach ($slot in 1..6) {
    foreach ($extension in @('SAV','STF','SFX')) {
      Remove-Item -LiteralPath (Join-Path $case.Data "CHRDATA$slot.$extension") -Force -ErrorAction SilentlyContinue
    }
  }
  Remove-Item -LiteralPath (Join-Path $case.Data 'ITEMS.DAT') -Force
  return $case
}

$contextArgs = '/E /X /A16 /@32788 /9 1 /L1234 /C2 /Y3 /Z88 /O2 /W5'
$contextReference = New-SecretContextCase 'context-uninterrupted'
Invoke-SecretOwnedBoot $contextReference 'context-reference' $contextArgs
& python $verifyContext $contextReference.C $root 'terminal'
if ($LASTEXITCODE -ne 0) { throw 'Uninterrupted context consumers did not preserve supplied scalars' }

$contextCapture = New-SecretContextCase 'context-completed-capture'
Copy-Item -LiteralPath (Join-Path $ownedCapture.C 'GBBOOT.COM') `
  -Destination (Join-Path $contextCapture.C 'GBBOOT.COM') -Force
@"
@echo off
C:\GBBOOT $contextArgs > C:\CTXCAP.TXT
if errorlevel 89 goto failed
if errorlevel 88 goto stopped
goto failed
:stopped
echo PASS > C:\CTXCAP.OK
goto done
:failed
echo FAIL > C:\CTXCAP.BAD
:done
"@ | Set-Content -LiteralPath (Join-Path $contextCapture.C 'CTXCAP.BAT') -Encoding ASCII
@"
[sdl]
fullscreen=false
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$($contextCapture.C)"
mount D "$($contextCapture.D)"
D:
call C:\CTXCAP.BAT
exit
"@ | Set-Content -LiteralPath $contextCapture.Conf -Encoding ASCII
$contextProcess = Start-DosBoxSmoke -Dosbox $dosbox -Conf $contextCapture.Conf -Headless:$Headless
if (-not $contextProcess.WaitForExit(120000)) {
  Stop-DosBoxSmoke -Process $contextProcess
  throw 'All-context completed capture timed out'
}
if ($contextProcess.ExitCode -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $contextCapture.C 'CTXCAP.OK')) -or
    (Test-Path -LiteralPath (Join-Path $contextCapture.C 'CTXCAP.BAD'))) {
  throw 'All-context completed capture did not stop at guest88'
}
& python $verifyContext $contextCapture.C $root 'capture'
if ($LASTEXITCODE -ne 0) { throw 'Prepared descriptor lost frontend context before combat' }

foreach ($variant in @(
  @{Name='context-cold-no-scalars'; Args='/E /X /A16 /@32788 /9 1'},
  @{Name='context-cold-conflicting'; Args='/E /X /! /A16 /@32788 /9 1 /L1 /C1 /Y1 /Z1 /O1 /W1'}
)) {
  $case = Copy-SecretDurableContext $contextCapture $variant.Name
  Invoke-SecretOwnedBoot $case 'context-cold' $variant.Args
  & python $verifyContext $case.C $root 'terminal'
  if ($LASTEXITCODE -ne 0) { throw "Saved context lost/overridden: $($variant.Name)" }
  foreach ($name in @('_GBRES.BIN','_GBPARTY.GBP','_GBPARTY.GSK')) {
    if ((Get-FileHash -LiteralPath (Join-Path $case.C $name)).Hash -ne
        (Get-FileHash -LiteralPath (Join-Path $contextReference.C $name)).Hash) {
      throw "Saved-context cold/reference differ: $($variant.Name)/$name"
    }
  }
  foreach ($name in @('_GBCOMB.TRC','_GBCOMB.RAW','_GBSEED.BIN')) {
    if ((Get-FileHash -LiteralPath (Join-Path $case.C $name)).Hash -ne
        (Get-FileHash -LiteralPath (Join-Path $contextCapture.C $name)).Hash) {
      throw "Context recovery replayed combat or changed seed: $($variant.Name)/$name"
    }
  }
  $contextRepeatHashes = @{}
  foreach ($name in @('_GBPARTY.GSK','_GBPARTY.GBP','_GBCR.BIN','_GBRES.BIN','_GBCOMB.TRC','_GBCOMB.RAW','_GBSEED.BIN')) {
    $contextRepeatHashes[$name] = (Get-FileHash -LiteralPath (Join-Path $case.C $name)).Hash
  }
  Invoke-SecretOwnedBoot $case 'context-repeat' $variant.Args
  foreach ($name in $contextRepeatHashes.Keys) {
    if ((Get-FileHash -LiteralPath (Join-Path $case.C $name)).Hash -ne $contextRepeatHashes[$name]) {
      throw "Repeated context recovery changed acknowledged state: $($variant.Name)/$name"
    }
  }
}
Write-Output 'RESULT: GSK3 frontend context restores L/C/Y/Z and retained O/W/mode; cold omissions/conflicts/repeat equal reference PASS'

$metricFixture = Join-Path $EvidenceRoot 'live-strength.GLB'
$metricGenerator = Join-Path $EvidenceRoot 'build-live-strength.py'
@'
import pathlib,struct,sys
def w(n):return b'\x02'+struct.pack('<H',n)
def r(n):return b'\x03'+struct.pack('<H',n)
p=bytearray(20);p.extend(b'\x09'+w(0x1111)+r(0x0101));p.extend(b'\x1d'+r(0x0125))
p.extend(b'\x1c\x0b\x00\x48\x00\x05\x00\x48\x24');p.extend(b'\x1d'+r(0x0126)+b'\x00')
i=struct.pack('>3H',1,16,1);f=28+len(i);e=f+len(p)
pathlib.Path(sys.argv[1]).write_bytes(b'GLIB'+struct.pack('>IHBB',e,2,0,1)+b'GLIB'+struct.pack('>3I',28,f,e)+i+p)
'@ | Set-Content $metricGenerator -Encoding ASCII
& python $metricGenerator $metricFixture
if ($LASTEXITCODE -ne 0) { throw 'Live metric ECL fixture generation failed' }
$metricFixtureAudit = Join-Path $EvidenceRoot 'verify-live-strength-source.py'
@'
import pathlib,sys
sys.path.insert(0,sys.argv[2])
from tools.secret_continuation import source_member
b=pathlib.Path(sys.argv[1]).read_bytes();p=source_member(b,16)
assert p[20:]==b'\x09\x02\x11\x11\x03\x01\x01\x1d\x03\x25\x01\x1c\x0b\x00\x48\x00\x05\x00\x48\x24\x1d\x03\x26\x01\x00'
print(f'independent GLIB member16 source framing and 1Dh destinations PASS bytes={len(p)}')
'@ | Set-Content $metricFixtureAudit -Encoding ASCII
& python $metricFixtureAudit $metricFixture $root
if ($LASTEXITCODE -ne 0) { throw 'Independent held-source parser rejected the authored live metric program' }
function New-SecretMetricCase([string]$Name) {
  $case=New-SecretCase $Name; Copy-Item $metricFixture (Join-Path $case.Data 'ECL.GLB') -Force
  foreach($slot in 1..6){foreach($extension in @('SAV','STF','SFX')){$source=Join-Path $SecretDosPath "CHRDATA$slot.$extension";if(Test-Path $source){Copy-Item $source $case.Data -Force}}}
  return $case
}
$metricCapture=New-SecretMetricCase 'live-metric-capture'
Copy-Item (Join-Path $ownedCapture.C 'GBBOOT.COM') (Join-Path $metricCapture.C 'GBBOOT.COM') -Force
@('@echo off','C:\GBBOOT /E /X /A 16 /9 1 > C:\MCAP.TXT','if errorlevel 89 goto bad','if errorlevel 88 goto stop','goto bad',':stop','echo PASS > C:\MCAP.OK','goto done',':bad','echo FAIL > C:\MCAP.BAD',':done') | Set-Content (Join-Path $metricCapture.C 'MCAP.BAT') -Encoding ASCII
@"
[sdl]
fullscreen=false
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$($metricCapture.C)"
mount D "$($metricCapture.D)"
D:
call C:\MCAP.BAT
exit
"@ | Set-Content $metricCapture.Conf -Encoding ASCII
$mp=Start-DosBoxSmoke -Dosbox $dosbox -Conf $metricCapture.Conf -Headless:$Headless;$mp.PriorityClass=[System.Diagnostics.ProcessPriorityClass]::Normal;$mpid=$mp.Id
if(-not $mp.WaitForExit(120000)){Stop-DosBoxSmoke -Process $mp;throw 'Live metric capture timed out'}
if($mp.ExitCode -ne 0 -or -not(Test-Path (Join-Path $metricCapture.C 'MCAP.OK')) -or (Test-Path (Join-Path $metricCapture.C 'MCAP.BAD'))){throw 'Live metric STOP88 capture failed'}
@("pid=$mpid",'priority=Normal',"hostExit=$($mp.ExitCode)",'guestExit=88')|Set-Content (Join-Path $metricCapture.Root 'metric-capture.meta.txt') -Encoding ASCII
$metricArgs='/E /X /A 16 /9 1';$metricReference=New-SecretMetricCase 'live-metric-reference';Invoke-SecretOwnedBoot $metricReference 'metric-reference' $metricArgs
$metricCold=New-SecretMetricCase 'live-metric-cold'
foreach($entry in Get-ChildItem $metricCapture.C -Force){Copy-Item $entry.FullName $metricCold.C -Recurse -Force}
foreach($tool in Get-ChildItem $build -Filter '*.COM' -File){Copy-Item $tool.FullName $metricCold.C -Force};if($ComPath){Copy-Item $ComPath (Join-Path $metricCold.C 'CCCOMBAT.COM') -Force}
foreach($slot in 1..6){foreach($extension in @('SAV','STF','SFX')){Remove-Item (Join-Path $metricCold.Data "CHRDATA$slot.$extension") -Force -ErrorAction SilentlyContinue}}
Remove-Item (Join-Path $metricCold.Data 'ITEMS.DAT') -Force -ErrorAction SilentlyContinue
Invoke-SecretOwnedBoot $metricCold 'metric-cold' $metricArgs
$metricBefore=@{};foreach($name in @('_GBPARTY.GBP','_GBPARTY.GSK','_GBRES.BIN','_GBCR.BIN','_GBCOMB.TRC','_GBCOMB.RAW','_GBSEED.BIN')){$metricBefore[$name]=(Get-FileHash (Join-Path $metricCold.C $name)).Hash}
Invoke-SecretOwnedBoot $metricCold 'metric-repeat' $metricArgs
foreach($name in $metricBefore.Keys){if((Get-FileHash (Join-Path $metricCold.C $name)).Hash -ne $metricBefore[$name]){throw "Metric repeat changed $name"}}
$metricVerifier=Join-Path $EvidenceRoot 'verify-live-strength.py'
@'
import pathlib,struct,sys
sys.path.insert(0,sys.argv[4])
from tools.secret_roster import decode
from tools.secret_player_stats import player_stats,stf_items
from tools.secret_strength import normal_player_body,party_strength
from tools.secret_strength_oracle import StrengthOracle
from tools.secret_continuation import decode as dg
cap,ref,cold=map(pathlib.Path,sys.argv[1:4])
def roster(d):return decode((d/'_GBPARTY.GBP').read_bytes())
def val(d):
 r=roster(d);b=tuple(normal_player_body(player_stats(h.body,stf_items(h.stf),r.catalogue)) for h in r.heroes);x=party_strength(b);y=StrengthOracle().run(b).value;assert x==y;return x
def mem(d,name='_GBRES.BIN'):
 f=(d/name).read_bytes();n=struct.unpack_from('<H',f,196)[0];return dict(zip(struct.unpack_from('<'+'H'*n,f,198),struct.unpack_from('<'+'H'*n,f,1222)))
p0,p1=val(cap),val(ref);assert mem(cap,'_GBECL.BIN').get(0x125)==p0 and 0x126 not in mem(cap,'_GBECL.BIN');assert p0!=p1,(p0,p1)
assert mem(ref).get(0x125)==p0 and mem(ref).get(0x126)==p1 and mem(cold).get(0x125)==p0 and mem(cold).get(0x126)==p1
assert (ref/'_GBRES.BIN').read_bytes()==(cold/'_GBRES.BIN').read_bytes() and (ref/'_GBPARTY.GBP').read_bytes()==(cold/'_GBPARTY.GBP').read_bytes()
assert (ref/'_GBPARTY.GBP').read_bytes()!=(cap/'_GBPARTY.GBP').read_bytes()
g=dg((cold/'_GBPARTY.GSK').read_bytes());assert not(g.context.flags&1) and g.context.z==0
cr=(cap/'_GBCR.BIN').read_bytes();co=(cold/'_GBCR.BIN').read_bytes();assert co==cr[:14]+b'\x01\x00'+cr[16:],'cold recovery changed result except canonical consumed bit'
for n in ('_GBCOMB.TRC','_GBCOMB.RAW','_GBSEED.BIN'):assert (cold/n).read_bytes()==(cap/n).read_bytes(),n
def destinations(d,name):
 f=(d/name).read_bytes();ev=[struct.unpack_from('<10H',f,2252+i*20) for i in range(struct.unpack_from('<H',f,2250)[0])];return [(x[1],x[2]) for x in ev if x[0]==0x1d]
assert destinations(cap,'_GBECL.BIN')==[(1,0x125)]
assert destinations(ref,'_GBRES.BIN')==[(1,0x126)] and destinations(cold,'_GBRES.BIN')==[(1,0x126)]
print(f'live 1Dh P0={p0} P1={p1}; cold/reference equal, no replay, /Z absent PASS')
'@ | Set-Content $metricVerifier -Encoding ASCII
& python $metricVerifier $metricCapture.C $metricReference.C $metricCold.C $root
if($LASTEXITCODE -ne 0){throw 'Live source-derived 1Dh metric check failed'}
Write-Output 'RESULT: live Secret 1Dh pre/post-combat P0/P1, cold/repeat no replay, absent /Z PASS'
Write-Output "RESULT: GBBOOT Secret of the Silver Blades Amiga GLIB ECL combat handoff PASS ($outcome)"
