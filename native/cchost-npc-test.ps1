# cchost-npc-test.ps1 -- CCHOST /N: apply recorded DQK ADD_NPC joins (Task 35).
#
# Consumer of the GBEF join table that CCECL records in fx_npc_joins
# (GBEF +82 count, +84 {npcId, morale}).  Each join is looked up through the
# MONCHA.GLB member-0 id table and stored as a compact DQK GBPR row (name +
# GBD1 tail).  Rejections (full party, duplicate, missing member, bad input)
# must leave the roster byte-identical.
#
# Expected row contents are derived here by an independent PowerShell
# monchaRLE decoder, not copied from the assembler.
param(
  [switch]$Headless,
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  # Run an alternative CCHOST image (used to prove the test fails on HEAD).
  [string]$ComPath = ''
)
$ErrorActionPreference = 'Stop'

$root = $Root
$native = Join-Path $root 'native'
$build = Join-Path $native 'build'
$run = Join-Path $build 'cchost-npc-test'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
$monSrc = Join-Path $root 'The Dark Queen of Krynn\DISK2\MONCHA.GLB'
. (Join-Path $native 'dosbox-smoke.ps1')

if (-not (Test-Path $dosbox)) { Write-Output 'SKIP: CCHOST /N (retail DOSBox absent)'; return }
if (-not (Test-Path $monSrc)) { Write-Output 'SKIP: CCHOST /N (retail DQK MONCHA.GLB absent)'; return }

& (Join-Path $native 'build.ps1') -Target cchost
& (Join-Path $native 'build.ps1') -Target ccparty
if (-not $ComPath) { $ComPath = Join-Path $build 'cchost.com' }

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null
Copy-Item $ComPath (Join-Path $run 'CCHOST.COM') -Force
Copy-Item (Join-Path $build 'ccparty.com') (Join-Path $run 'CCPARTY.COM') -Force
Copy-Item $monSrc (Join-Path $run 'MONCHA.GLB') -Force

function Set-U16([byte[]]$B, [int]$O, [int]$V) { [BitConverter]::GetBytes([UInt16]$V).CopyTo($B, $O) }
function Get-U16([byte[]]$B, [int]$O) { [int][BitConverter]::ToUInt16($B, $O) }
function Join-Bytes([object[]]$Parts) {
  $ms = New-Object IO.MemoryStream
  foreach ($p in $Parts) { [byte[]]$b = $p; $ms.Write($b, 0, $b.Length) }
  return ,$ms.ToArray()
}

# ---- independent MONCHA reader -------------------------------------------
[byte[]]$monBytes = [IO.File]::ReadAllBytes($monSrc)
$ptrCount = (Get-U16 $monBytes 8) + 1
$ptrs = @(0..($ptrCount - 1) | ForEach-Object { [BitConverter]::ToUInt32($monBytes, 16 + 4 * $_) })
if ($ptrs[$ptrCount - 1] -ne $monBytes.Length) { throw 'MONCHA pointer table does not end at EOF' }
function Expand-Moncha([byte[]]$Src) {
  $out = New-Object System.Collections.Generic.List[byte]
  $i = 0
  while ($i -lt $Src.Length) {
    $c = $Src[$i++]
    if ($c -eq 0x80) { continue }
    if ($c -lt 0x80) { for ($k = 0; $k -le $c; $k++) { $out.Add($Src[$i++]) } }
    else { $v = $Src[$i++]; for ($k = 0; $k -lt (257 - $c); $k++) { $out.Add($v) } }
  }
  return ,$out.ToArray()
}
function Get-MemberBytes([byte[]]$Glb, [int]$Member) {
  $n = (Get-U16 $Glb 8) + 1
  $a = [BitConverter]::ToUInt32($Glb, 16 + 4 * $Member)
  $b = [BitConverter]::ToUInt32($Glb, 16 + 4 * ($Member + 1))
  return ,$Glb[$a..($b - 1)]
}
function Get-NpcRecord([byte[]]$Glb, [int]$NpcId) {
  $t = Get-MemberBytes $Glb 0
  $cnt = Get-U16 $t 0
  for ($i = 0; $i -lt $cnt; $i++) {
    if ((Get-U16 $t (2 + 4 * $i)) -eq $NpcId) {
      $m = Get-U16 $t (4 + 4 * $i)
      $raw = Get-MemberBytes $Glb $m
      $want = ([int]$raw[0] -shl 8) -bor [int]$raw[1]
      $dec = Expand-Moncha $raw[2..($raw.Length - 1)]
      if ($dec.Length -ne $want) { throw "member $m expands to $($dec.Length), header says $want" }
      return @{ Member = $m; Dec = $dec }
    }
  }
  throw "id $NpcId absent from MONCHA id table"
}
function Get-ExpectedRow([byte[]]$Dec, [int]$NpcId, [int]$Morale) {
  $name = ''
  for ($i = 0; $i -lt 15; $i++) { $c = $Dec[0x68 + $i]; if ($c -eq 0) { break }; $name += [char]$c }
  $name = $name.ToUpperInvariant()
  $mv = [int][math]::Floor($Dec[0x90] / 3); if ($Dec[0x90] -lt 3 -or $mv -eq 0) { $mv = 1 }; if ($mv -gt 4) { $mv = 4 }
  $mask = $Dec[0xBF]
  $cls = if ($mask -band 0x58) { 1 } elseif ($mask -band 4) { 4 } elseif ($mask -band 2) { 2 } elseif ($mask -band 1) { 3 } else { 0 }
  return @{
    Name = $name; Hp = [int]$Dec[0x198]; Ac = 60 - [int]$Dec[0xBB]; DCount = [int]$Dec[0xB5]; DSides = [int]$Dec[0xB7]
    Level = [int]$Dec[0x91]; Class = $cls; BaseAc = [int]$Dec[0xBB]; Thac0 = 60 - [int]$Dec[0x87]; Move = $mv
    MaxHp = [int]$Dec[0x89]; Mark = ([int]($Morale / 2) -bor 0x80); Id = $NpcId
  }
}

# ---- fixture builders ------------------------------------------------------
$ENTRY = 410
function New-Row([int]$Slot, [string]$Name, [bool]$Npc = $false, [int]$Hp = 20) {
  $r = New-Object byte[] $ENTRY
  $r[0] = $Slot
  $r[1] = $Name.Length
  [Text.Encoding]::ASCII.GetBytes($Name).CopyTo($r, 2)
  [Text.Encoding]::ASCII.GetBytes('GBD1').CopyTo($r, 217)
  Set-U16 $r 221 1
  Set-U16 $r 223 $Hp
  Set-U16 $r 243 $Hp
  if ($Npc) { $r[301] = 0xB2; $r[302] = 115 }
  return ,$r
}
function New-Roster([object[]]$Rows, [int]$TitleId = 3) {
  $h = New-Object byte[] 16
  [Text.Encoding]::ASCII.GetBytes('GBPR').CopyTo($h, 0)
  Set-U16 $h 4 2; Set-U16 $h 6 $Rows.Count; Set-U16 $h 8 $ENTRY; Set-U16 $h 10 1; Set-U16 $h 12 $TitleId; Set-U16 $h 14 1
  return ,(Join-Bytes (@(,$h) + $Rows))
}
function New-Effect([int[][]]$Joins, [int]$Count = -1) {
  $e = New-Object byte[] 5750
  [Text.Encoding]::ASCII.GetBytes('GBEF').CopyTo($e, 0)
  Set-U16 $e 4 9
  Set-U16 $e 6 0x10
  if ($Count -lt 0) { $Count = $Joins.Count }
  Set-U16 $e 82 $Count
  for ($i = 0; $i -lt $Joins.Count; $i++) { Set-U16 $e (84 + 4 * $i) $Joins[$i][0]; Set-U16 $e (86 + 4 * $i) $Joins[$i][1] }
  return ,$e
}
# v15 (5,932-byte) record as CCECL/CCFLOW publish it: GBHD at 5720 with the halt
# reason at 5724, an empty GBMS menu extension at 5774, and the GBRF raw-flag tail
# at 5920.  The sidecar flag, reason, status and NPC flag are independent knobs so
# each rejection control differs from the control record in exactly one of them.
function New-EffectV15([int[][]]$Joins, [int]$Status = 4, [int]$Reason = 0, [bool]$Sidecar = $false, [bool]$NpcFlag = $true, [int]$Version = 15) {
  $e = New-Object byte[] 5932
  [Text.Encoding]::ASCII.GetBytes('GBEF').CopyTo($e, 0)
  Set-U16 $e 4 $Version
  $fl = 0; if ($NpcFlag) { $fl = $fl -bor 0x10 }; if ($Sidecar) { $fl = $fl -bor 0x100 }
  Set-U16 $e 6 $fl
  Set-U16 $e 8 $Status
  [Text.Encoding]::ASCII.GetBytes('GBHD').CopyTo($e, 5720)
  Set-U16 $e 5724 $Reason
  [Text.Encoding]::ASCII.GetBytes('GBMS').CopyTo($e, 5774)
  [Text.Encoding]::ASCII.GetBytes('GBRF').CopyTo($e, 5920)
  Set-U16 $e 82 $Joins.Count
  for ($i = 0; $i -lt $Joins.Count; $i++) { Set-U16 $e (84 + 4 * $i) $Joins[$i][0]; Set-U16 $e (86 + 4 * $i) $Joins[$i][1] }
  return ,$e
}
function Extend-Rows([object[]]$Base, [object[]]$Extra) {
  $l = New-Object System.Collections.ArrayList
  foreach ($b in $Base) { [void]$l.Add($b) }
  foreach ($e in $Extra) { [void]$l.Add($e) }
  return ,$l.ToArray()
}
$native3 = @((New-Row 0x80 'HERO ONE'), (New-Row 0x81 'HERO TWO'))

$cases = New-Object System.Collections.Generic.List[hashtable]
$batch = New-Object System.Collections.Generic.List[string]
function Add-Case([string]$Name, [byte[]]$Roster, [byte[]]$Effect, [string]$Moncha = 'MONCHA.GLB') {
  [IO.File]::WriteAllBytes((Join-Path $run "$Name.GPR"), $Roster)
  [IO.File]::WriteAllBytes((Join-Path $run "$Name.EFX"), $Effect)
  $script:batch.Add("CCHOST /N C:\$Name.EFX C:\$Moncha C:\$Name.GPR > C:\$Name.LOG")
  $script:batch.Add("if errorlevel 1 echo x > C:\$Name.NZ")
  $script:cases.Add(@{ Name = $Name; Pre = $Roster })
}

# C01 apply one join; C02 re-apply the same event to C01's result is staged
# after the run (it needs C01's output), so it is a second batch pass below.
$tass = Get-NpcRecord $monBytes 115
$grun = Get-NpcRecord $monBytes 113
Add-Case 'C01' (New-Roster $native3) (New-Effect @(,@(115, 100)))
# GBPR rows are capped at 8 (retail DQK cap, dqk-add-npc-full-party.md): C03 is a full
# eight-row roster, C04 a seven-row roster given two joins (the first fits, the second
# overflows, nothing is written).  C40..C42 are the 7th and 8th joins that used to be
# rejected at the old six-row cap.
$native6 = Extend-Rows $native3 @((New-Row 0x82 'HERO 3'), (New-Row 0x83 'HERO 4'), (New-Row 0x84 'HERO 5'), (New-Row 0x85 'HERO 6'))
$native7 = Extend-Rows $native6 @(,(New-Row 0x86 'HERO 7'))
$native8 = Extend-Rows $native7 @(,(New-Row 0x87 'HERO 8'))
Add-Case 'C03' (New-Roster $native8) (New-Effect @(,@(115, 100)))
Add-Case 'C04' (New-Roster $native7) (New-Effect @(@(115, 100), @(113, 100)))
Add-Case 'C40' (New-Roster $native6) (New-Effect @(,@(115, 100)))
Add-Case 'C41' (New-Roster $native7) (New-Effect @(,@(113, 100)))
Add-Case 'C42' (New-Roster $native6) (New-Effect @(@(115, 100), @(113, 100)))
Add-Case 'C05' (New-Roster $native3) (New-Effect @(@(115, 100), @(200, 100)))
Add-Case 'C06' (New-Roster $native3) (New-Effect @(@(115, 100), @(113, 100)))
Add-Case 'C07' (New-Roster $native3 2) (New-Effect @(,@(115, 100)))
$good = New-Roster $native3
Add-Case 'C08' $good[0..($good.Length - 2)] (New-Effect @(,@(115, 100)))
Add-Case 'C09' $good (New-Effect @(,@(115, 100)) 9)
Add-Case 'C10' $good (New-Effect @())
Add-Case 'C11' (New-Roster @((New-Row 1 'ONE'), (New-Row 2 'TWO'), (New-Row 3 'THREE'), (New-Row 4 'FOUR'), (New-Row 5 'FIVE'), (New-Row 6 'SIX'), (New-Row 7 'SEVEN'), (New-Row 8 'EIGHT'))) (New-Effect @(,@(115, 100)))
Add-Case 'C12' (New-Roster (Extend-Rows $native3 @(,(New-Row 0x82 'TASSLEHOFF' $true)))) (New-Effect @(,@(115, 100)))
Add-Case 'C13' (New-Roster (Extend-Rows $native3 @(,(New-Row 0x82 'TASSLEHOFF' $false)))) (New-Effect @(,@(115, 100)))
Add-Case 'C14' (New-Roster @((New-Row 0x81 'HERO TWO'), (New-Row 0x80 'HERO ONE'))) (New-Effect @(,@(115, 100)))
Add-Case 'C15' $good (New-Effect @(,@(115, 100))) 'NOPE.GLB'

# C16: id table points id 115 at a nonexistent member.
$badTable = [byte[]]$monBytes.Clone()
$t0 = [int]$ptrs[0]; $cnt0 = Get-U16 $badTable $t0
for ($i = 0; $i -lt $cnt0; $i++) { if ((Get-U16 $badTable ($t0 + 2 + 4 * $i)) -eq 115) { Set-U16 $badTable ($t0 + 4 + 4 * $i) 150 } }
[IO.File]::WriteAllBytes((Join-Path $run 'BADTAB.GLB'), $badTable)
Add-Case 'C16' $good (New-Effect @(,@(115, 100))) 'BADTAB.GLB'
# C17: library cut short so its pointer table runs past EOF.
[IO.File]::WriteAllBytes((Join-Path $run 'SHORT.GLB'), $monBytes[0..9999])
Add-Case 'C17' $good (New-Effect @(,@(115, 100))) 'SHORT.GLB'

# C18: mutate only member 94 (Tasselhoff): same length word, new stat bytes,
# re-encoded as literal runs and spliced back with every later pointer moved.
$mut = [byte[]]$tass.Dec.Clone()
$mut[0x198] = 70; $mut[0x89] = 71; $mut[0x91] = 23
$enc = New-Object System.Collections.Generic.List[byte]
$enc.Add([byte]($mut.Length -shr 8)); $enc.Add([byte]($mut.Length -band 0xFF))
for ($o = 0; $o -lt $mut.Length; $o += 128) {
  $n = [math]::Min(128, $mut.Length - $o)
  $enc.Add([byte]($n - 1)); for ($k = 0; $k -lt $n; $k++) { $enc.Add($mut[$o + $k]) }
}
$mi = $tass.Member
$oldLen = [int]($ptrs[$mi + 1] - $ptrs[$mi]); $delta = $enc.Count - $oldLen
$new = New-Object System.Collections.Generic.List[byte]
$new.AddRange([byte[]]$monBytes[0..([int]$ptrs[$mi] - 1)]); $new.AddRange($enc.ToArray()); $new.AddRange([byte[]]$monBytes[[int]$ptrs[$mi + 1]..($monBytes.Length - 1)])
$mutGlb = $new.ToArray()
for ($i = $mi + 1; $i -lt $ptrCount; $i++) { [BitConverter]::GetBytes([UInt32]($ptrs[$i] + $delta)).CopyTo($mutGlb, 16 + 4 * $i) }
[IO.File]::WriteAllBytes((Join-Path $run 'MUT.GLB'), $mutGlb)
Add-Case 'C18' (New-Roster $native3) (New-Effect @(,@(115, 100))) 'MUT.GLB'

# ---- /N validates the effect like /D (round 9 T5) -------------------------
$one = @(,@(115, 100))
# (e) control: a genuine status-4 / sidecar / reason-10 loop record.  It lists
# the same id twice (a loop period containing one ADD_NPC), so it also proves
# each distinct id is applied once.
Add-Case 'C20' (New-Roster $native3) (New-EffectV15 @(@(115, 100), @(115, 100)) 4 10 $true)
# Ordinary status-4 capacity record, reason 7, no sidecar: also genuine.
Add-Case 'C21' (New-Roster $native3) (New-EffectV15 $one 4 7 $false)
# (a) reason 10 without the sidecar flag.
Add-Case 'C22' (New-Roster $native3) (New-EffectV15 $one 4 10 $false)
# (b) the sidecar flag with reason 7.
Add-Case 'C23' (New-Roster $native3) (New-EffectV15 $one 4 7 $true)
# (c) FX_HAVE_NPC clear with a join listed: v9 and v15.
$noFlag = New-Effect @(,@(115, 100)); Set-U16 $noFlag 6 0
Add-Case 'C24' (New-Roster $native3) $noFlag
Add-Case 'C25' (New-Roster $native3) (New-EffectV15 $one 4 7 $false $false)
# (d) a 116-byte file stamped v15 (exactly what the old reader accepted).
$short = New-EffectV15 $one 4 7 $false
Add-Case 'C26' (New-Roster $native3) ([byte[]]$short[0..115])
# Status other than the two /D accepts for v15 (1 = combat yield, 3 = halted).
Add-Case 'C27' (New-Roster $native3) (New-EffectV15 $one 3 7 $false)
# A trailing byte on a v15 and on a v9 record.
Add-Case 'C28' (New-Roster $native3) ([byte[]](New-EffectV15 $one 4 7 $false) + [byte]0)
Add-Case 'C29' (New-Roster $native3) ([byte[]](New-Effect $one) + [byte]0)
# A version /D does not know (10) at the v9 length.
$v10 = New-Effect $one; Set-U16 $v10 4 10
Add-Case 'C30' (New-Roster $native3) $v10
# Idempotent replay inside one event: existing Tasselhoff + [115 again, 113] adds only Grunschka.
Add-Case 'C31' (New-Roster (Extend-Rows $native3 @(,(New-Row 0x82 'TASSLEHOFF' $true)))) (New-Effect @(@(115, 100), @(113, 100)))

# Reuse of the first batch result: C02 re-applies C01's event to C01's output
# and C19 cold-reloads C01's output through CCPARTY.  Both are staged by a
# second pass because they consume the first pass' files.
$batch.Add('copy C:\C01.GPR C:\C02.GPR > nul')
$batch.Add('copy C:\C01.EFX C:\C02.EFX > nul')
$batch.Add('copy C:\C01.GPR C:\C02.PRE > nul')
$batch.Add('CCHOST /N C:\C02.EFX C:\MONCHA.GLB C:\C02.GPR > C:\C02.LOG')
$batch.Add('if errorlevel 1 echo x > C:\C02.NZ')
$batch.Add('mkdir C:\RELOAD')
$batch.Add('copy C:\C01.GPR C:\RELOAD\ROSTER.GBP > nul')
$batch.Add('copy C:\CCPARTY.COM C:\RELOAD\CCPARTY.COM > nul')
$batch.Add('C:\RELOAD\CCPARTY /Q C:\RELOAD\ROSTER.GBP > C:\C19.LOG')
$batch.Add('if errorlevel 1 echo x > C:\C19.NZ')
$batch.Add('mkdir C:\RELOAD8')
$batch.Add('copy C:\C42.GPR C:\RELOAD8\ROSTER.GBP > nul')
$batch.Add('copy C:\CCPARTY.COM C:\RELOAD8\CCPARTY.COM > nul')
$batch.Add('C:\RELOAD8\CCPARTY /Q C:\RELOAD8\ROSTER.GBP > C:\C44.LOG')
$batch.Add('if errorlevel 1 echo x > C:\C44.NZ')
$batch.Add('exit')
$batch | Set-Content -Path (Join-Path $run 'RUN.BAT') -Encoding ASCII
$conf = Join-Path $run 'run.conf'
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
if (-not $p.WaitForExit(90000)) { Stop-DosBoxSmoke -Process $p; throw 'DOSBox did not exit while running CCHOST /N' }

# ---- assertions ---------------------------------------------------------------
function Test-NZ([string]$Name) { $f = Join-Path $run "$Name.NZ"; return ((Test-Path $f) -and (Get-Item $f).Length -gt 0) }
function Read-Out([string]$Name) { return ,[IO.File]::ReadAllBytes((Join-Path $run "$Name.GPR")) }
function Read-Log([string]$Name) {
  $f = Join-Path $run "$Name.LOG"
  if (-not (Test-Path $f)) { throw "$Name produced no log (CCHOST did not run)" }
  return (Get-Content $f -Raw)
}
function Assert-Rejected([string]$Name, [string]$Needle) {
  $log = Read-Log $Name
  if ($log -notlike "*$Needle*") { throw "$Name expected '$Needle', got: $log" }
  if (-not ((Test-NZ $Name))) { throw "$Name logged a rejection but exited zero" }
  $pre = ($cases | Where-Object { $_.Name -eq $Name }).Pre
  $post = Read-Out $Name
  if ($post.Length -ne $pre.Length -or (Compare-Object $pre $post -SyncWindow 0).Count) { throw "$Name rejection changed the roster file" }
}
# Exit 0, a logged skip, roster byte-identical (a replayed join is not an error).
function Assert-Idempotent([string]$Name) {
  $log = Read-Log $Name
  if ($log -notlike '*skipped: already in party*') { throw "$Name expected a logged skip, got: $log" }
  if ($log -like '*applied*') { throw "$Name claims a join was applied: $log" }
  if ((Test-NZ $Name)) { throw "$Name skip exited nonzero" }
  $pre = ($cases | Where-Object { $_.Name -eq $Name }).Pre
  $post = Read-Out $Name
  if ($post.Length -ne $pre.Length -or (Compare-Object $pre $post -SyncWindow 0).Count) { throw "$Name idempotent skip changed the roster file" }
}
function Assert-Row([byte[]]$Roster, [int]$Index, $Exp, [int]$Slot) {
  $o = 16 + $Index * $ENTRY
  if ($Roster[$o] -ne $Slot) { throw "row $Index slot $($Roster[$o]) != $Slot" }
  $len = $Roster[$o + 1]
  $nm = [Text.Encoding]::ASCII.GetString($Roster, $o + 2, $len)
  if ($nm -ne $Exp.Name) { throw "row $Index name '$nm' != '$($Exp.Name)'" }
  $f = @{ 223 = 'Hp'; 225 = 'Ac'; 227 = 'DCount'; 229 = 'DSides'; 233 = 'Level'; 237 = 'Thac0'; 239 = 'Move'; 243 = 'MaxHp' }
  foreach ($k in $f.Keys) { $got = Get-U16 $Roster ($o + $k); $want = $Exp[$f[$k]]; if ($got -ne $want) { throw "row $Index $($f[$k]) got $got want $want" } }
  if ($Roster[$o + 235] -ne $Exp.Class) { throw "row $Index class $($Roster[$o + 235]) != $($Exp.Class)" }
  if ($Roster[$o + 236] -ne $Exp.BaseAc) { throw "row $Index baseAC $($Roster[$o + 236]) != $($Exp.BaseAc)" }
  if ($Roster[$o + 301] -ne $Exp.Mark -or $Roster[$o + 302] -ne $Exp.Id) { throw "row $Index NPC flag/id $($Roster[$o + 301])/$($Roster[$o + 302])" }
  if ([Text.Encoding]::ASCII.GetString($Roster, $o + 217, 4) -ne 'GBD1') { throw "row $Index lost its GBD1 tail" }
}
function Assert-PrefixKept([byte[]]$Pre, [byte[]]$Post, [int]$Rows) {
  for ($i = 16; $i -lt 16 + $Rows * $ENTRY; $i++) { if ($Pre[$i] -ne $Post[$i]) { throw "existing row byte $i changed" } }
  for ($i = 0; $i -lt 16; $i++) { if ($i -in 6, 7) { continue }; if ($Pre[$i] -ne $Post[$i]) { throw "header byte $i changed" } }
}

$expTass = Get-ExpectedRow $tass.Dec 115 100
$expGrun = Get-ExpectedRow $grun.Dec 113 100
if ($expTass.Name -ne 'TASSLEHOFF' -or $expTass.Hp -ne 64 -or $expTass.Level -ne 22 -or $expTass.Class -ne 4) { throw "independent decode of member $($tass.Member) disagrees with research: $($expTass | Out-String)" }
if ($expGrun.Name -ne 'GRUNSCHKA' -or $expGrun.Class -ne 2) { throw 'independent decode of Grunschka disagrees with research' }

# C01: one join -> exactly one new row, existing rows untouched.
if ((Read-Log 'C01') -notlike '*npc joins applied*' -or ((Test-NZ 'C01'))) { throw "C01 did not apply: $(Read-Log 'C01')" }
$c01 = Read-Out 'C01'
if ($c01.Length -ne 16 + 3 * $ENTRY -or (Get-U16 $c01 6) -ne 3) { throw "C01 length/count wrong: $($c01.Length)/$(Get-U16 $c01 6)" }
Assert-PrefixKept $cases[0].Pre $c01 2
Assert-Row $c01 2 $expTass 0x82
# C02: the same event again is a duplicate, file untouched.
$c02pre = [IO.File]::ReadAllBytes((Join-Path $run 'C02.PRE'))
if ((Read-Log 'C02') -notlike '*skipped: already in party*' -or ((Test-NZ 'C02'))) { throw "C02 re-apply must be an idempotent exit 0 skip: $(Read-Log 'C02')" }
$c02 = Read-Out 'C02'
if ($c02.Length -ne $c02pre.Length -or (Compare-Object $c02 $c02pre -SyncWindow 0).Count) { throw 'C02 re-apply altered the roster' }
if ((Read-Log 'C02') -like '*applied*') { throw 'C02 skip claimed to apply a join' }
# C19: cold reload through CCPARTY keeps the companion byte-for-byte.
$rel = [IO.File]::ReadAllBytes((Join-Path $run 'RELOAD\ROSTER.GBP'))
if (-not (Test-Path (Join-Path $run 'C19.LOG')) -or ((Test-NZ 'C19'))) { throw "CCPARTY cold reload failed: $(Get-Content (Join-Path $run 'C19.LOG') -Raw -ErrorAction SilentlyContinue)" }
if ($rel.Length -ne $c01.Length -or (Compare-Object $rel $c01 -SyncWindow 0).Count) { throw 'cold CCPARTY reload did not preserve the companion row byte-for-byte' }
if ((Get-Content (Join-Path $run 'C19.LOG') -Raw) -notlike '*loaded 3 member(s)*') { throw 'CCPARTY cold reload did not load the 3 rows' }
# Rejections.
# Seventh and eighth joins now succeed (they were exit 2 at the six-row cap).
$c40 = Read-Out 'C40'
if ((Read-Log 'C40') -notlike '*npc joins applied*' -or (Test-NZ 'C40') -or $c40.Length -ne 16 + 7 * $ENTRY -or (Get-U16 $c40 6) -ne 7) { throw "C40 seventh join failed: $(Read-Log 'C40') len $($c40.Length)" }
Assert-PrefixKept $cases[0].Pre $c40 0
Assert-Row $c40 6 $expTass 0x86
$c41 = Read-Out 'C41'
if ((Read-Log 'C41') -notlike '*npc joins applied*' -or (Test-NZ 'C41') -or $c41.Length -ne 16 + 8 * $ENTRY -or (Get-U16 $c41 6) -ne 8) { throw "C41 eighth join failed: $(Read-Log 'C41') len $($c41.Length)" }
Assert-Row $c41 7 $expGrun 0x87
$c42 = Read-Out 'C42'
if ((Read-Log 'C42') -notlike '*npc joins applied*' -or (Test-NZ 'C42') -or $c42.Length -ne 16 + 8 * $ENTRY -or (Get-U16 $c42 6) -ne 8) { throw "C42 two joins (7th+8th) failed: $(Read-Log 'C42') len $($c42.Length)" }
Assert-Row $c42 6 $expTass 0x86
Assert-Row $c42 7 $expGrun 0x87
if ((Get-Content (Join-Path $run 'C44.LOG') -Raw -ErrorAction SilentlyContinue) -notlike '*loaded 8 member(s)*' -or (Test-NZ 'C44')) { throw "CCPARTY cold reload of the eight-row roster failed: $(Get-Content (Join-Path $run 'C44.LOG') -Raw -ErrorAction SilentlyContinue)" }
$rel8 = [IO.File]::ReadAllBytes((Join-Path $run 'RELOAD8\ROSTER.GBP'))
if ($rel8.Length -ne $c42.Length -or (Compare-Object $rel8 $c42 -SyncWindow 0).Count) { throw 'cold CCPARTY reload did not preserve the eight-row roster byte-for-byte' }
Assert-Rejected 'C03' 'party full'
Assert-Rejected 'C04' 'party full'     # first join would fit; the second overflows -> nothing written
Assert-Rejected 'C05' 'no such member'  # first join valid, second missing -> nothing written
Assert-Rejected 'C07' 'input invalid'
Assert-Rejected 'C08' 'input invalid'
Assert-Rejected 'C09' 'input invalid'
Assert-Rejected 'C11' 'party full'     # eight source-slot rows
Assert-Idempotent 'C12'
Assert-Rejected 'C15' 'input invalid'
Assert-Rejected 'C16' 'no such member'
Assert-Rejected 'C17' 'input invalid'
# C13: same name without the NPC flag is not the retail guard's match -> joins (slot 0x83 is next free).
$c13 = Read-Out 'C13'
if ((Read-Log 'C13') -notlike '*applied*' -or $c13.Length -ne 16 + 4 * $ENTRY) { throw "C13 (unflagged namesake) should join: $(Read-Log 'C13')" }
Assert-Row $c13 3 $expTass 0x83
# C14: slot selection takes the first unused native id, not the row count.
$c14 = Read-Out 'C14'
Assert-Row $c14 2 $expTass 0x82
# C10: zero joins is a successful no-op.
if ((Read-Log 'C10') -notlike '*joins none*' -or ((Test-NZ 'C10'))) { throw 'C10 zero-join event was not a clean no-op' }
$c10 = Read-Out 'C10'
if ($c10.Length -ne $good.Length -or (Compare-Object $c10 $good -SyncWindow 0).Count) { throw 'C10 no-op changed the roster' }
# C06: two joins in one event, in order.
$c06 = Read-Out 'C06'
if ((Read-Log 'C06') -notlike '*applied*' -or $c06.Length -ne 16 + 4 * $ENTRY) { throw "C06 two-join event failed: $(Read-Log 'C06')" }
Assert-Row $c06 2 $expTass 0x82
Assert-Row $c06 3 $expGrun 0x83
# C18: mutating the MONCHA member changes only the new row, in exactly the mutated fields.
$mutDec = Get-NpcRecord $mutGlb 115
$expMut = Get-ExpectedRow $mutDec.Dec 115 100
if ($expMut.Hp -ne 70 -or $expMut.MaxHp -ne 71 -or $expMut.Level -ne 23) { throw 'mutated fixture does not decode to the mutated stats' }
$c18 = Read-Out 'C18'
if ((Read-Log 'C18') -notlike '*applied*') { throw "C18 mutated join failed: $(Read-Log 'C18')" }
Assert-Row $c18 2 $expMut 0x82
Assert-PrefixKept $cases[0].Pre $c18 2
$diff = @(0..($c01.Length - 1) | Where-Object { $c01[$_] -ne $c18[$_] })
$inRow = 16 + 2 * $ENTRY
$outside = @($diff | Where-Object { $_ -lt $inRow -or $_ -ge $inRow + $ENTRY })
if ($outside.Count -ne 0) { throw "mutating one MONCHA member changed bytes outside its row: $($outside -join ',')" }
$offs = @($diff | ForEach-Object { $_ - $inRow } | Sort-Object)
if (($offs -join ',') -ne '223,233,243') { throw "mutation changed row offsets $($offs -join ',') (expected HP 223, level 233, max HP 243)" }

# T5: effect validation.  Controls first (they must JOIN), then the rejections.
$c20 = Read-Out 'C20'
if ((Read-Log 'C20') -notlike '*skipped: already in party*' -or (Read-Log 'C20') -notlike '*applied*' -or ((Test-NZ 'C20'))) { throw "C20 genuine reason-10 loop record: $(Read-Log 'C20')" }
if ($c20.Length -ne 16 + 3 * $ENTRY -or (Get-U16 $c20 6) -ne 3) { throw "C20 repeated id was not applied exactly once: $($c20.Length)" }
Assert-Row $c20 2 $expTass 0x82
$c21 = Read-Out 'C21'
if ((Read-Log 'C21') -notlike '*applied*' -or $c21.Length -ne 16 + 3 * $ENTRY) { throw "C21 genuine status-4 record: $(Read-Log 'C21')" }
Assert-Row $c21 2 $expTass 0x82
Assert-Rejected 'C22' 'input invalid'   # reason 10 without the sidecar flag
Assert-Rejected 'C23' 'input invalid'   # sidecar flag with reason 7
Assert-Rejected 'C24' 'input invalid'   # FX_HAVE_NPC clear, v9
Assert-Rejected 'C25' 'input invalid'   # FX_HAVE_NPC clear, v15
Assert-Rejected 'C26' 'input invalid'   # 116-byte "v15"
Assert-Rejected 'C27' 'input invalid'   # v15 status 3
Assert-Rejected 'C28' 'input invalid'   # v15 + trailing byte
Assert-Rejected 'C29' 'input invalid'   # v9 + trailing byte
Assert-Rejected 'C30' 'input invalid'   # unknown version 10
$c31 = Read-Out 'C31'
if ((Read-Log 'C31') -notlike '*skipped: already in party*' -or (Read-Log 'C31') -notlike '*applied*' -or $c31.Length -ne 16 + 4 * $ENTRY) { throw "C31 dup+new: $(Read-Log 'C31')" }
Assert-Row $c31 3 $expGrun 0x83

Write-Output "PASS: CCHOST /N applied DQK ADD_NPC joins once (Tasselhoff member $($tass.Member), Grunschka member $($grun.Member)); replayed joins skipped idempotently (exit 0, byte-identical roster), full parties, missing members and malformed/forged/short effects (reason 10 w/o sidecar, sidecar w/ reason 7, NPC flag clear, 116-byte v15, bad status/version/length) rejected with byte-identical rosters; genuine reason-10 loop record applies each id once; cold CCPARTY reload preserved the row; MONCHA mutation moved only 3 fields in 1 row"
Write-Output 'RESULT: CCHOST /N DQK NPC recruitment PASS'
