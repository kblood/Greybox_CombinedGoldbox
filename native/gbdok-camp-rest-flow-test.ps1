# GBBOOT DoK camp/rest parity flow.
#
# Item: dok-camp-rest-parity. Proves the is_gen1_rest_capable consolidation in
# native/src/gbboot.asm actually unlocks DoK's camp/rest/checkpoint path, with
# every probe shown FAILING against a controlled mutant before it is shown
# PASSING against the shipped binary -- never against pre-recorded prose.
#
# WHY A SOURCE-LEVEL MUTANT, NOT `git show HEAD:...`
# ---------------------------------------------------
# The obvious way to get a "before" GBBOOT.COM is to assemble
# `git show HEAD:native/src/gbboot.asm`. That is wrong for a script that has
# to keep working after this change is committed: once the fix lands, HEAD
# *is* the fixed source, so a git-history "before" build would silently stop
# proving anything on every future run. Instead this script takes the CURRENT
# checked-in source, mechanically reverts the five
# `call is_gen1_rest_capable` gate sites back to the original
# `cmp word [gamep], game_cok` (byte-for-byte what those sites read before
# this item), and assembles THAT as the mutant. The regex must match exactly
# 5 sites -- if a future edit changes that count, this script throws instead
# of quietly testing nothing.
#
# ACCEPTANCE COVERAGE
# --------------------
#   1. Camp menu prints R/S (Gen1-shared) but not M (CoK-only): SOURCE check,
#      because .camp_yield unconditionally flips camp_once 1->2 before
#      .camp_options ever prints for ANY title, so no headless/CLI-only
#      DOSBox session -- for any Gen1 game already in this suite -- ever
#      observes that menu text on stdout. Verified by grep: zero existing
#      flow script asserts on s_rest_option/s_mem_option text.
#   2. R reaches run_cok_rest past load_cok_camp_state: mutant FAILS
#      (native preview failed, no 'Rest iterations'), shipped binary PASSES.
#   3. S reports s_checkpoint_saved, not s_checkpoint_failed: same mutant
#      flip, checkpoint_store's own gate.
#   4. A DoK GBS checkpoint round-trips through checkpoint_restore with
#      byte-matching rest_fx/rest_party/timer state: shipped-binary-only
#      (the mutant cannot even produce a checkpoint to restore), byte
#      comparison via Assert-BytesEqual.
#   5. FIND_ITEM probes a real, non-/I-seeded owned item. DoK's own
#      real-inventory path is structurally unreachable (finding, documented
#      below and in native/README.md) -- CCINV's owned-inventory file paths
#      are hardcoded to CoK's SAVE\CHRDATA{n}.STF naming, AND
#      write_seed_sidecar's item-bitmap 'Q' import (native/src/gbboot.asm,
#      "cmp word [gamep], game_cok" immediately before "mov al,'Q'") is
#      explicitly CoK-only and untouched by this item. So this criterion is
#      satisfied on CoK (the real, working instance of the mechanism DoK's
#      Rest now shares the surrounding camp code with), with a companion DoK
#      check that the bitmap path is verifiably NEVER reached.
#
# FOUR MORE FLAG_DOK GATES, FOUND BY RUNNING THIS FLOW FOR REAL
# ---------------------------------------------------------------
# is_gen1_rest_capable's 5-site consolidation (mutation-tested above) is not
# the only thing that stood between DoK and a working camp/rest/checkpoint.
# Running an actual DoK /2-headless rest+save surfaced FOUR more independent
# rejects on ccparty.asm's FLAG_DOK word (GBPR body offset 10, 0=CoK/1=DoK)
# that the original `cmp word [gamep], game_cok` text search could not find
# because none of them match that pattern:
#   6. load_cok_camp_state (native/src/gbboot.asm) re-checked FLAG_DOK itself
#      right after is_gen1_rest_capable admitted DoK, silently re-rejecting
#      it (`test word [rest_party+10],1 / jnz .fail`).
#   7. checkpoint_validate (native/src/gbboot.asm), shared by checkpoint_store
#      and checkpoint_restore, required FLAG_DOK==0 in the saved roster
#      (`cmp word [rest_party+10],0 / jne checkpoint_bad`).
#   8. ccinv.asm's open_core required the checkpoint's game-id byte (gbboot's
#      checkpoint_header+6, 1 CoK/2 DoK) to equal 1.
#   9. ccinv.asm's owners: -- shared by FOUR CCINV modes ('I' import, 'S'/'L'
#      checkpoint store/load via open_core, 'Q' query, 'R' learn) -- rejected
#      the same embedded GBPR header's FLAG_DOK word (core+5808) for ALL of
#      them. Relaxing it unconditionally was tried first and is WRONG: it
#      regressed gbboot-create-test.ps1's negative learning fixture C0185
#      (native/learning-fixtures.py mutates this exact word to 1 inside a
#      scroll-learning request and asserts CCINV rejects it, matching
#      tools/cok_learning.py's independent reference model, which requires
#      the roster's flags word to be exactly 0 for 'R'/learn_mode). Caught by
#      running the FULL flow sweep, not by inspection. The shipped fix scopes
#      the FLAG_DOK==1 acceptance to only 'I'/'S'/'L' via the shared [mode]
#      byte; 'Q' and 'R' remain strictly CoK-only, matching
#      rest_learn_prepare/rest_learn_tick's own CoK-only guards in
#      gbboot.asm, for the same real-character-data-collision reason.
# All four were verified load-bearing by hand (not scripted here, to avoid
# doubling this script's DOSBox run count): reverting #6+#7 together (with
# is_gen1_rest_capable and both CCINV fixes left in place) reproduces the
# exact original failure -- DoK rest never prints "Rest iterations" at all,
# failing inside run_cok_rest before load_cok_camp_state returns. Reverting
# #8+#9 together (with gbboot.asm fully fixed) reproduces the SECOND failure
# this item hit during development -- DoK rest completes all 300 ticks, then
# checkpoint_store's 'S' CCINV call prints CCINV's own
# "Inventory could not be loaded or saved." and the checkpoint is never
# written. Both mutants were assembled from the current shipped source with
# only that pair of sites reverted, run through this script's own $run/DoK
# fixture, and confirmed to fail at exactly those points before the shipped
# gbboot.com/ccinv.com pair (proven passing above) were restored.
#
# A FIFTH AND SIXTH GATE, FOUND BY THIS ITEM (dok-rest-real-gam-parity),
# BOTH ONLY VISIBLE AGAINST REAL RETAIL DATA
# ---------------------------------------------------------------
# The four gates above were all found by #6-#9's ORIGINAL /R-created-fixture
# development run, which cannot exercise anything that only branches on
# actual character-body byte VALUES (a fresh /R character's body is zero
# except what setcreate populates). This item's job was exactly that: run a
# REAL retail CHRDATA{1..6}.GAM party through rest, which surfaced two more
# defects the /R fixture is structurally blind to:
#   10. rest_heal_party (native/src/gbboot.asm) read/wrote CoK CCH offsets
#       392 (status)/407 (current HP, also the write target)/98 (max HP) on
#       every party member every 288 ticks, with NO rest_party+10 (FLAG_DOK)
#       gate at all -- unlike #6/#7 above, this one never made rest FAIL
#       outright (its write offsets sit inside padding or unread bytes for a
#       /R-created DoK body, and it doesn't jc anywhere), so it looked
#       harmless and was invisible until the real 216-byte .GAM body's own
#       byte 98 was measured (see the FINDING output further down: byte 98
#       is real, non-zero DoK data on all 6 shipped pregens, not padding).
#       Fixed the same way as #6/#7: gated on rest_party+10.
#   11. rest_write_party (native/src/gbboot.asm) -- THE ACTUAL BLOCKER for
#       this item's real-.GAM run, found only by instrumenting a throwaway
#       diagnostic copy of gbboot.asm with DBG: marker prints around every
#       silent jc-.fail site in run_cok_rest's .persist: chain (never
#       committed; native/src/gbboot.asm itself was untouched during that
#       diagnosis). After writing the roster back to _GBPARTY.GBP, this
#       function loops every member whose record-header slot byte is 1..6
#       and unconditionally rewrites SAVE\CHRDATA<slot>.SAV with the
#       member's 409-byte body -- a CoK-only compatibility path ("original
#       low-numbered saves receive the same body") with no FLAG_DOK gate.
#       A real DoK party loaded from CHRDATA{1..6}.GAM carries those exact
#       slot tags (1..6, matching the .GAM filename numbering CCPARTY
#       assigns them on import), so this loop tried to open()-for-update a
#       SAVE\CHRDATA1.SAV that has never existed for DoK (DoK's own retail
#       save is the .GAM this body already came from) -- the open fails,
#       rest_write_party returns carry, and run_cok_rest fails SILENTLY
#       (before its own "Rest iterations" report line, which is why the
#       DOSBox transcript went straight from "Camp/X - Leave camp" to the
#       generic top-level "native preview failed" with nothing in between).
#       A /R-created DoK party never hits this because setcreate's synthetic
#       members carry the native high-bit slot convention documented in the
#       comment just above .saves:, not a real 1..6 tag. Fixed the same way:
#       gated the whole .saves: loop on rest_party+10, leaving the
#       unconditional _GBPARTY.GBP roster write (both titles' actual
#       persistence mechanism) untouched.
# Differential proof #11 was NOT a regression from #10's edit: the identical
# real-.GAM fixture was run against an assembly of `git show
# HEAD:native/src/gbboot.asm` (i.e. this item's own starting point, before
# either of gates #10/#11 existed) and failed with the byte-identical
# "native preview failed" transcript, confirming #11 pre-dated this item and
# was not introduced by #10's rest_heal_party gate.
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$dokGame = Join-Path $root 'Death Knights of Krynn'
$cokGame = Join-Path $root 'Champions of Krynn'
$run = Join-Path $build 'gbdok-camp-rest-flow-test'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
$nasm = 'C:\Users\Caldor\AppData\Local\bin\NASM\nasm.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: GBBOOT DoK camp/rest flow (DOSBox.exe absent)'
  exit 0
}

function Get-I16LE([byte[]]$Bytes, [int]$Offset) { return [BitConverter]::ToInt16($Bytes, $Offset) }

function Set-Session([int]$x, [int]$y, [int]$facing) {
  $s = New-Object byte[] 16
  [Text.Encoding]::ASCII.GetBytes('GBSN').CopyTo($s, 0)
  [BitConverter]::GetBytes([uint16]1).CopyTo($s, 4)
  [BitConverter]::GetBytes([uint16]$x).CopyTo($s, 6)
  [BitConverter]::GetBytes([uint16]$y).CopyTo($s, 8)
  [BitConverter]::GetBytes([uint16]$facing).CopyTo($s, 10)
  [BitConverter]::GetBytes([uint16]16).CopyTo($s, 12)
  [BitConverter]::GetBytes([uint16]16).CopyTo($s, 14)
  [IO.File]::WriteAllBytes((Join-Path $cbin '_GBSESS.GBS'), $s)
}

function ConvertTo-DaxLiteralRle([byte[]]$Raw) {
  $compressed = [System.Collections.Generic.List[byte]]::new()
  $offset = 0
  while ($offset -lt $Raw.Length) {
    $chunk = [Math]::Min(128, $Raw.Length - $offset)
    $compressed.Add([byte]($chunk - 1))
    for ($i = 0; $i -lt $chunk; $i++) { $compressed.Add($Raw[$offset + $i]) }
    $offset += $chunk
  }
  return $compressed.ToArray()
}

function Write-SyntheticDaxBlocks([string]$Path, [hashtable[]]$Blocks) {
  $entries = @()
  $dataSize = 0
  foreach ($block in $Blocks) {
    [byte[]]$raw = $block.Raw
    [byte[]]$comp = ConvertTo-DaxLiteralRle $raw
    $entries += ,@{ Id = [int]$block.Id; Offset = $dataSize; RawSize = $raw.Length; Comp = $comp }
    $dataSize += $comp.Length
  }
  $tocBytes = 9 * $entries.Count
  [byte[]]$bytes = [byte[]]::new(2 + $tocBytes + $dataSize)
  [BitConverter]::GetBytes([UInt16]$tocBytes).CopyTo($bytes, 0)
  for ($i = 0; $i -lt $entries.Count; $i++) {
    $entry = $entries[$i]
    $entryBase = 2 + ($i * 9)
    $bytes[$entryBase] = [byte]$entry.Id
    [BitConverter]::GetBytes([UInt32]$entry.Offset).CopyTo($bytes, $entryBase + 1)
    [BitConverter]::GetBytes([UInt16]$entry.RawSize).CopyTo($bytes, $entryBase + 5)
    [BitConverter]::GetBytes([UInt16]$entry.Comp.Length).CopyTo($bytes, $entryBase + 7)
    [Array]::Copy($entry.Comp, 0, $bytes, 2 + $tocBytes + $entry.Offset, $entry.Comp.Length)
  }
  [IO.File]::WriteAllBytes($Path, $bytes)
}

function Write-SyntheticGeoDax([string]$Path, [byte]$BlockId = 34) {
  $compressed = [System.Collections.Generic.List[byte]]::new()
  $remaining = 1026
  while ($remaining -gt 0) {
    $chunk = [Math]::Min(128, $remaining)
    $compressed.Add([byte](256 - $chunk)); $compressed.Add([byte]0)
    $remaining -= $chunk
  }
  [byte[]]$comp = $compressed.ToArray()
  [byte[]]$bytes = [byte[]]::new(11 + $comp.Length)
  $bytes[0] = 9; $bytes[2] = $BlockId; $bytes[7] = 0x02; $bytes[8] = 0x04
  $bytes[9] = [byte]($comp.Length -band 0xFF)
  $bytes[10] = [byte](($comp.Length -shr 8) -band 0xFF)
  [Array]::Copy($comp, 0, $bytes, 11, $comp.Length)
  [IO.File]::WriteAllBytes($Path, $bytes)
}

function Assert-BytesEqual([byte[]]$Want, [byte[]]$Got, [string]$Label) {
  if ($Want.Length -ne $Got.Length) { throw "$Label length differs: want $($Want.Length) got $($Got.Length)" }
  for ($i = 0; $i -lt $Want.Length; $i++) {
    if ($Want[$i] -ne $Got[$i]) { throw "$Label byte $i differs: want $($Want[$i]) got $($Got[$i])" }
  }
}

foreach ($p in @(
    (Join-Path $dokGame 'DKK.CFG'), (Join-Path $dokGame 'ECL1.DAX'),
    (Join-Path $dokGame 'GEO1.DAX'), (Join-Path $dokGame 'WALLDEF1.DAX'), (Join-Path $dokGame '8X8D1.DAX'),
    (Join-Path $cokGame 'KRYNN.CFG'), $dosbox)) {
  if (-not (Test-Path $p)) { Write-Output "SKIP: GBBOOT DoK camp/rest flow ($p absent)"; exit 0 }
}

if (-not (Test-Path $nasm)) {
  $g = Get-Command nasm -ErrorAction SilentlyContinue
  if ($g) { $nasm = $g.Source } else { throw 'NASM not found for the source-mutant build' }
}

& (Join-Path $native 'build.ps1') -Target engine  # boot /R needs a fresh CCHOST.COM (plan §28.3)
. (Join-Path $native 'dosbox-smoke.ps1')

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null

# All DOS-side C: mounts for this script use an isolated copy of the built
# tool set, never native/build directly -- native/build/gbboot.com is a
# shared artifact other flow scripts (and the other agent working this repo
# concurrently) may read at the same time this script is swapping in a
# mutant binary. $cbin starts as a copy of every built .COM tool; only
# $cbin\GBBOOT.COM is ever overwritten per-invocation.
$cbin = Join-Path $run 'cbin'
New-Item -ItemType Directory -Force $cbin | Out-Null
Get-ChildItem (Join-Path $build '*.COM') | ForEach-Object { Copy-Item $_.FullName (Join-Path $cbin $_.Name) -Force }

# ---------------------------------------------------------------------------
# 0. Acceptance #1: source-level menu-gating check (see header rationale).
# ---------------------------------------------------------------------------
$srcPath = Join-Path $native 'src\gbboot.asm'
$src = Get-Content $srcPath -Raw
$srcHashAtStart = (Get-FileHash $srcPath -Algorithm SHA256).Hash  # never rewritten below; only read into $src for regex transforms assembled elsewhere
if ($src -notmatch '(?s)\.camp_options:.*?call\s+is_gen1_rest_capable\s*\r?\n\s*jne\s+\.camp_mem_check\s*\r?\n\s*mov\s+si,\s*s_rest_option') {
  throw 'source check: .camp_options no longer gates s_rest_option (R/S) behind is_gen1_rest_capable'
}
if ($src -notmatch '(?s)\.camp_mem_check:.*?cmp\s+word\s+\[gamep\],\s*game_cok\s*\r?\n\s*jne\s+\.camp_key\s*\r?\n\s*mov\s+si,\s*s_mem_option') {
  throw 'source check: .camp_mem_check no longer keeps s_mem_option (M) CoK-only'
}
# RETIRED 2026-09-09: this used to compare against `git show HEAD:...` and
# THROW if HEAD already contained is_gen1_rest_capable, on the theory that a
# HEAD without the symbol would prove the two `-notmatch` checks above test a
# real addition rather than a pre-existing pattern. That worked exactly once
# -- in the commit (4dc4768) that landed the symbol, when HEAD was still the
# prior commit -- and was then permanently self-invalidating: is_gen1_rest_
# capable is committed history now, so every later HEAD contains it and this
# control would throw on every future run regardless of whether the source
# actually still gates correctly, which is precisely the "control that
# outlived its own measurement" failure shape this repo keeps re-finding.
# The two `-notmatch` checks above already assert the thing that matters
# (current source gates R/S on is_gen1_rest_capable, M stays CoK-only); this
# block no longer needs a historical HEAD comparison to be meaningful.
Write-Output 'source-check: current source gates R/S on is_gen1_rest_capable, M stays CoK-only (the HEAD-diff half of this control was retired 2026-09-09 -- it was a one-time check that self-invalidated the moment its own commit landed)'

# ---------------------------------------------------------------------------
# 1. Build the mutant: revert the 5 is_gen1_rest_capable call sites to the
#    original CoK-only gate, byte-for-byte, and assemble it standalone.
# ---------------------------------------------------------------------------
$pattern = 'call\s+is_gen1_rest_capable'
$matchCount = [regex]::Matches($src, $pattern).Count
if ($matchCount -ne 5) {
  throw "mutation setup: expected exactly 5 'call is_gen1_rest_capable' sites, found $matchCount -- source has changed shape, update this script's mutant before trusting it"
}
$mutSrc = [regex]::Replace($src, $pattern, 'cmp     word [gamep], game_cok')
$mutSrcPath = Join-Path $run 'gbboot_mutant.asm'
Set-Content -Path $mutSrcPath -Value $mutSrc -NoNewline -Encoding ASCII
$mutCom = Join-Path $run 'GBBOOT_MUT.COM'
$mutLst = Join-Path $run 'gbboot_mutant.lst'
$srcInclude = (Join-Path $native 'src') + '\'
& $nasm -f bin -I $srcInclude $mutSrcPath -o $mutCom -l $mutLst
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $mutCom)) { throw 'mutation setup: nasm failed to assemble the reverted-gate mutant' }
Write-Output "mutant assembled: $mutCom ($((Get-Item $mutCom).Length) bytes) -- 5/5 is_gen1_rest_capable sites reverted to CoK-only"

# ---------------------------------------------------------------------------
# 2/3. Acceptance #2 and #3: DoK camp entry + rest ticks + checkpoint save,
#    against the mutant (must FAIL) then the shipped binary (must PASS).
#    Synthetic ECL1.DAX block 34 mirrors native/gbboot-create-test.ps1's own
#    CoK rest fixture exactly (period/chance forced to 0: no RNG encounter
#    risk), over real DoK GEO1.DAX/WALLDEF1.DAX/8X8D1.DAX so first-person
#    art loading is real, not synthetic.
# ---------------------------------------------------------------------------
foreach ($name in @('DKK.CFG', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX')) {
  Copy-Item (Join-Path $dokGame $name) (Join-Path $run $name) -Force
}
[byte[]]$campEcl = [byte[]]::new(36)
[byte[]]$body = @(0x09,0,11,1,0x10,0x4C, 0x21,0,34,0,2,0,255, 0)
[Array]::Copy($body, 0, $campEcl, 22, $body.Length)
Write-SyntheticDaxBlocks (Join-Path $run 'ECL1.DAX') @(@{ Id = 34; Raw = $campEcl })

function Invoke-DokCamp([string]$GbbootCom, [string]$Label, [int]$Ticks) {
  foreach ($n in @('_GBPARTY.GBP', '_GBSEED.BIN', '_GBECL.BIN', '_GBECL.TXT', '_GBSTEP.BIN', 'DOKCAMP.TXT')) {
    Remove-Item -LiteralPath (Join-Path $cbin $n) -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath (Join-Path $run 'GREYBOX.GBS'), (Join-Path $run 'GREYBOX.BAK') -Force -ErrorAction SilentlyContinue
  Copy-Item $GbbootCom (Join-Path $cbin 'GBBOOT.COM') -Force
  $conf = Join-Path $build "_gbdok_camp_$Label.conf"
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$cbin"
mount D "$run"
D:
C:\GBBOOT /E /X /2 $Ticks /4 /B 34 /R DOK_CLERIC C /R DOK_KNIGHT K /R DOK_MAGE M /R DOK_THIEF T > C:\DOKCAMP.TXT
exit
"@ | Set-Content $conf -Encoding ASCII
  Set-Session 0 0 0
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless
  if (-not $p.WaitForExit(30000)) { Stop-Process -Id $p.Id -Force; throw "GBBOOT DoK camp/rest ($Label) timed out" }
  return Get-Content (Join-Path $cbin 'DOKCAMP.TXT') -Raw
}

$shippedCom = Join-Path $build 'gbboot.com'  # external, read-only reference; never written by this script

# --- MUTANT: must FAIL both the rest reach-through and the checkpoint save.
$mutOut = Invoke-DokCamp $mutCom 'mutant' 300
if ($mutOut -notlike '*GBBOOT: native preview failed*') {
  throw "MUTATION-TEST FAILED: reverted-gate GBBOOT did not fail DoK camp/rest -- probe cannot discriminate. Output: $mutOut"
}
if ($mutOut -like '*Rest iterations:*') { throw 'MUTATION-TEST FAILED: reverted-gate GBBOOT still ran DoK rest to completion' }
if ($mutOut -like '*Camp saved to GREYBOX.GBS*') { throw 'MUTATION-TEST FAILED: reverted-gate GBBOOT still saved a DoK checkpoint' }
if (Test-Path (Join-Path $run 'GREYBOX.GBS')) { throw 'MUTATION-TEST FAILED: reverted-gate GBBOOT left a GREYBOX.GBS on disk despite reporting failure' }
Write-Output "mutation-test RED confirmed: pre-fix gate fails DoK camp/rest ('$($mutOut.Trim())')"

# --- SHIPPED: must PASS both.
$newOut = Invoke-DokCamp $shippedCom 'shipped' 300
if ($newOut -like '*GBBOOT: native preview failed*') { throw "Acceptance #2/#3 FAILED on shipped GBBOOT.COM: $newOut" }
if ($newOut -notlike '*Rest iterations: 300*') { throw "Acceptance #2 FAILED: shipped GBBOOT.COM did not run DoK rest to completion (300 iterations). Output: $newOut" }
if ($newOut -notlike '*Camp saved to GREYBOX.GBS*') { throw "Acceptance #3 FAILED: shipped GBBOOT.COM did not report s_checkpoint_saved for DoK. Output: $newOut" }
if ($newOut -like '*Camp save failed*') { throw 'Acceptance #3 FAILED: shipped GBBOOT.COM reported s_checkpoint_failed for DoK' }
Write-Output "mutation-test GREEN confirmed: shipped gate runs DoK rest (300 iterations) and saves ('Camp saved to GREYBOX.GBS')"

# --- Finding, CORRECTED 2026-09-09 after an adversarial review found the
# original justification half-wrong. The claim as first written said all
# three of rest_heal_party's CoK-CCH offsets -- 392 (status), 407 (HP), 98
# (maxHP) -- sit "inside DoK's always-zero GBD1-tail padding". That is TRUE
# for 392 and 407 only: ccparty.asm's clear_charbuf zero-fills the full
# CHAR_SIZE=409-byte buffer, DoK's import then overwrites bytes 0..215 with
# the real retail .GAM record and bytes 216..243ish with DOK_META_* (ending
# at DOK_META_MAXHP, offset 216+26+2=244), then writes the AWARD_XP cache at
# bytes 244..275 and never touches bytes 276..408
# again -- so 392 and 407 genuinely stay zero. Offset 98 is NOT in that
# range (98 < 216): it lands squarely inside the real 216-byte DoK body, and
# measuring all 6 shipped `Death Knights of Krynn\SAVE\CHRDATA{1..6}.GAM`
# pregens directly gives byte 98 = 83, 83, 42, 113, 42, 113 -- non-zero and
# varying, not padding at all (docs/engine/research/dok-chrdata-save-format.md
# 2.4 lists 96..215 as an unmapped-but-populated tail, consistent with this).
# So rest_heal_party's maxHP READ at offset 98 was reading real, meaningful
# DoK character data as if it were a CoK maxHP cap -- garbage-in, but into a
# computation whose result was, until this fix, still garbage-out.
#
# The defensible justification is the one a full read of every offset-407
# site in this codebase actually supports: offset 407, the field
# rest_heal_party WRITES, is read by NO DoK-aware consumer anywhere in
# native/src -- every other site that touches body offset 407
# (gbboot.asm's two GBCR combat-writeback patchers, gated on
# `test word [rosterhdr+10],1`; cccombat.asm's morale/HP loader, gated on
# `cmp byte [party_dok],0`; ccparty.asm's fresh-CoK-member HP seed, gated on
# `cmp byte [dokmode],0`) explicitly SKIPS offset 407 for DoK. rest_heal_party
# was the one place in the file that touched a CoK-shaped offset without that
# same gate -- an omission, not a deliberate exception.
#
# FIX (not just re-justification): rest_heal_party now opens with
# `cmp word [rest_party+10],0 / jne .done`, the same FLAG_DOK word every one
# of those other sites already checks (and the same word checkpoint_validate
# and load_cok_camp_state already gate on for this exact rest_party buffer).
# For DoK parties the function is now a true no-op -- it never reads offset
# 98 or writes offset 392/407 at all, so there is no longer an "inert write"
# to justify, only a documented historical one. Cost: +6 resident bytes
# (64,843 -> 64,849 of the 65,280 .COM ceiling; see native/README.md).
#
# This finding-check therefore asserts the STRONGER, simpler post-fix
# invariant directly: bytes 392/407/98 are BYTE-FOR-BYTE UNCHANGED from
# their as-imported values (not merely "still zero" -- 98 was never zero to
# begin with for a /R-created fresh DoK member either, see below), and
# DoK's real GBD1 HP field (DOK_META_HP, body offset 216+6) is untouched.
# NOTE ON THIS FIXTURE'S OWN LIMIT: these are /R-created (`DOK_CLERIC` etc.),
# not real retail characters, so bytes 392/407/98 are zero here BY
# CONSTRUCTION and this loop cannot by itself tell a correct no-op from a
# no-op that only looks safe because the fixture's fields happen to start at
# zero. The genuine parity check -- real retail `.GAM` data, non-zero at
# offset 98, run through the same camp/rest path via the normal party-load
# import (no /R) -- is below, after acceptance #4, and IS mutation-tested
# against a corrupting mutant.
$gbprPath = Join-Path $cbin '_GBPARTY.GBP'
$gbpr = [IO.File]::ReadAllBytes($gbprPath)
$preRestGbpr = [IO.File]::ReadAllBytes($gbprPath)  # same file; bytes 392/407/98 are 0 pre-rest for a fresh /R member, recorded for clarity, not reused
for ($i = 0; $i -lt 4; $i++) {
  $rec = 16 + $i * 410
  $meta = $rec + 1 + 216
  if ([Text.Encoding]::ASCII.GetString($gbpr, $meta, 4) -ne 'GBD1') { throw "finding-check: entry $i lost its GBD1 tail after rest" }
  $hp = Get-I16LE $gbpr ($meta + 6)
  if ($hp -le 0) { throw "finding-check: entry $i DOK_META_HP is non-positive ($hp) after rest -- did rest corrupt real DoK data instead of no-op'ing?" }
  if ($gbpr[$rec + 1 + 392] -ne 0 -or $gbpr[$rec + 1 + 407] -ne 0 -or $gbpr[$rec + 1 + 98] -ne 0) {
    throw "finding-check: entry $i CoK-shaped offsets 392/407/98 changed from their as-imported zero -- rest_heal_party's DoK gate (cmp word [rest_party+10],0) is no longer skipping this record, re-check the fix"
  }
}
Write-Output 'FINDING confirmed by measurement (fresh /R fixture, corrected 2026-09-09): DoK rest_heal_party is now gated on FLAG_DOK (rest_party+10) and never touches CoK-shaped offsets 392/407/98 for a DoK party; the earlier "all three offsets are always-zero padding" justification was false for offset 98 (real, non-zero DoK data -- verified against all 6 shipped CHRDATA*.GAM), true for 392/407 only. See native/README.md. This fixture cannot rule out a no-op that only looks safe because /R-created fields start at zero -- see the real-.GAM check after acceptance #4.'

# ---------------------------------------------------------------------------
# 4. Acceptance #4: checkpoint round-trip, byte-matching rest_fx/rest_party.
#    Shipped binary only -- the mutant cannot produce a DoK checkpoint at all
#    (already proven above), so there is nothing to round-trip against it.
# ---------------------------------------------------------------------------
$savedFx = [IO.File]::ReadAllBytes((Join-Path $cbin '_GBECL.BIN'))
$savedParty = [IO.File]::ReadAllBytes($gbprPath)
$savedCheckpoint = [IO.File]::ReadAllBytes((Join-Path $run 'GREYBOX.GBS'))

foreach ($n in @('_GBPARTY.GBP', '_GBECL.BIN', '_GBSEED.BIN', 'DOKREST.TXT')) {
  Remove-Item -LiteralPath (Join-Path $cbin $n) -Force -ErrorAction SilentlyContinue
}
Copy-Item $shippedCom (Join-Path $cbin 'GBBOOT.COM') -Force
$restoreConf = Join-Path $build '_gbdok_camp_restore.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$cbin"
mount D "$run"
D:
C:\GBBOOT /5 /X > C:\DOKREST.TXT
exit
"@ | Set-Content $restoreConf -Encoding ASCII
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $restoreConf -Headless
if (-not $p.WaitForExit(30000)) { Stop-Process -Id $p.Id -Force; throw 'GBBOOT DoK checkpoint restore timed out' }
$restoreOut = Get-Content (Join-Path $cbin 'DOKREST.TXT') -Raw
if ($restoreOut -like '*native preview failed*' -or $restoreOut -notlike '*Camp restored from GREYBOX.GBS*') {
  throw "Acceptance #4 FAILED: DoK checkpoint did not restore. Output: $restoreOut"
}
Assert-BytesEqual $savedCheckpoint ([IO.File]::ReadAllBytes((Join-Path $run 'GREYBOX.GBS'))) 'DoK checkpoint file (restore must not mutate it)'
Assert-BytesEqual $savedFx ([IO.File]::ReadAllBytes((Join-Path $cbin '_GBECL.BIN'))) 'DoK rest_fx (script memory/clock/RNG/timer state)'
Assert-BytesEqual $savedParty ([IO.File]::ReadAllBytes((Join-Path $cbin '_GBPARTY.GBP'))) 'DoK rest_party (roster incl. GBD1 tails)'
Write-Output 'Acceptance #4 confirmed: DoK checkpoint restores and rest_fx/rest_party are byte-identical to what was saved'

# --- Negative control for #4: corrupt the saved game-id byte (offset 6) the
# same way checkpoint_validate now checks it (checkpoint_game_id: 1 CoK / 2
# DoK) and confirm a CoK-stamped checkpoint is REJECTED for DoK, proving the
# id check introduced alongside is_gen1_rest_capable is not a rubber stamp.
$wrongId = [byte[]]$savedCheckpoint.Clone()
$crcZeroed = [byte[]]$wrongId.Clone()
$wrongId[6] = 1 # 1 = CoK; this checkpoint is DoK's, so this must now be rejected
[IO.File]::WriteAllBytes((Join-Path $run 'GREYBOX.GBS'), $wrongId)
Remove-Item -LiteralPath (Join-Path $cbin '_GBPARTY.GBP'), (Join-Path $cbin '_GBECL.BIN'), (Join-Path $cbin 'DOKREST.TXT') -Force -ErrorAction SilentlyContinue
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $restoreConf -Headless
if (-not $p.WaitForExit(30000)) { Stop-Process -Id $p.Id -Force; throw 'GBBOOT DoK wrong-game-id restore timed out' }
$wrongOut = Get-Content (Join-Path $cbin 'DOKREST.TXT') -Raw
if ($wrongOut -notlike '*native preview failed*' -or $wrongOut -like '*Camp restored*') {
  throw "MUTATION-TEST FAILED: a checkpoint stamped game-id=1 (CoK) while loaded as DoK was accepted instead of rejected. Output: $wrongOut"
}
Write-Output 'checkpoint game-id check confirmed: a CoK-stamped (id=1) checkpoint is rejected when restored as DoK'
[IO.File]::WriteAllBytes((Join-Path $run 'GREYBOX.GBS'), $savedCheckpoint)

# ---------------------------------------------------------------------------
# 4b. THE GENUINE PARITY CHECK (added 2026-09-09, adversarial-review DEFECT 2).
#
# The finding-check above uses /R-created fresh characters, where bytes
# 392/407/98 are zero BY CONSTRUCTION -- it cannot fail against the case
# that actually matters: a REAL retail DoK character whose byte 98 is real,
# non-zero data (measured earlier: 83/83/42/113/42/113 across the 6 shipped
# pregens), where a healer that misreads it as "maxHP" and writes a computed
# result back could silently corrupt something if the write target were
# ever wired up. This step loads the real retail party through the ordinary
# import path (no /R at all -- mounting a folder whose SAVE\ has real
# CHRDATA{1..6}.GAM/.JNK/.WIZ is what makes GBBOOT's normal boot populate
# the roster, exactly as native/gbdok-flow-test.ps1's own /E /X check does),
# runs it through the same camp/rest path, and asserts the field a DoK-aware
# consumer actually reads (DOK_META_HP/MAXHP) is unchanged, AND that the
# real 216-byte body is byte-for-byte identical to the untouched retail
# source -- including byte 98 equalling its real non-zero source value,
# not merely "still zero".
$realGamSource = Join-Path $dokGame 'SAVE'
$realRun = Join-Path $run 'real-gam'
New-Item -ItemType Directory -Force (Join-Path $realRun 'SAVE') | Out-Null
foreach ($name in @('DKK.CFG', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX')) {
  Copy-Item (Join-Path $dokGame $name) (Join-Path $realRun $name) -Force
}
Write-SyntheticDaxBlocks (Join-Path $realRun 'ECL1.DAX') @(@{ Id = 34; Raw = $campEcl })
for ($i = 1; $i -le 6; $i++) {
  foreach ($ext in @('GAM', 'JNK', 'WIZ')) {
    # NOTE: this loop variable was named $src until 2026-09-09, silently
    # clobbering the top-level $src (the full gbboot.asm source text read at
    # the top of this script for BOTH mutation sections below) with a file
    # path string -- every regex match against $src after this loop ran saw
    # a path, not source, and matched 0 times. Renamed to $srcGamFile; never
    # reuse $src for anything but native/src/gbboot.asm's text in this file.
    $srcGamFile = Join-Path $realGamSource "CHRDATA$i.$ext"
    if (Test-Path $srcGamFile) { Copy-Item $srcGamFile (Join-Path $realRun "SAVE\CHRDATA$i.$ext") -Force }
  }
}

# Baseline the REAL retail SAVE folder (size+mtime, never git status -- a
# byte-identical rewrite is invisible to git) so a mount mistake that pointed
# at the retail folder instead of this copy would be caught, not assumed
# absent. CLAUDE.md: retail game folders are read-only source.
$realGamBaseline = Get-ChildItem $realGamSource -File | ForEach-Object {
  [PSCustomObject]@{ Name = $_.Name; Length = $_.Length; LastWriteTimeUtc = $_.LastWriteTimeUtc }
}

function Invoke-DokRealGam([string]$GbbootCom, [string]$Label, [int]$Ticks) {
  foreach ($n in @('_GBPARTY.GBP', '_GBSEED.BIN', '_GBECL.BIN', '_GBECL.TXT', '_GBSTEP.BIN', 'DOKRGAM.TXT')) {
    Remove-Item -LiteralPath (Join-Path $cbin $n) -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath (Join-Path $realRun 'GREYBOX.GBS'), (Join-Path $realRun 'GREYBOX.BAK') -Force -ErrorAction SilentlyContinue
  Copy-Item $GbbootCom (Join-Path $cbin 'GBBOOT.COM') -Force
  $conf = Join-Path $build "_gbdok_realgam_$Label.conf"
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$cbin"
mount D "$realRun"
D:
C:\GBBOOT /E /X /2 $Ticks /B 34 > C:\DOKRGAM.TXT
exit
"@ | Set-Content $conf -Encoding ASCII
  Set-Session 0 0 0
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless
  if (-not $p.WaitForExit(30000)) { Stop-Process -Id $p.Id -Force; throw "GBBOOT DoK real-.GAM camp/rest ($Label) timed out" }
  return Get-Content (Join-Path $cbin 'DOKRGAM.TXT') -Raw
}

# Independently-known retail HP/maxHP for CHRDATA1..6.GAM byte 40 -- see
# docs/engine/research/dok-chrdata-save-format.md 2.4 and native/gbdok-flow-test.ps1.
$realDokHp = @(95, 102, 78, 52, 58, 53)

function Test-DokRealGamParity([string]$OutText, [string]$Label) {
  if ($OutText -like '*native preview failed*') { throw "DoK real-.GAM parity ($Label) FAILED to boot: $OutText" }
  $gbprPath = Join-Path $cbin '_GBPARTY.GBP'
  $gbpr = [IO.File]::ReadAllBytes($gbprPath)
  if ([Text.Encoding]::ASCII.GetString($gbpr, 0, 4) -ne 'GBPR' -or
      [BitConverter]::ToUInt16($gbpr, 4) -ne 2 -or
      [BitConverter]::ToUInt16($gbpr, 6) -ne 6 -or
      [BitConverter]::ToUInt16($gbpr, 8) -ne 410 -or
      [BitConverter]::ToUInt16($gbpr, 10) -ne 1 -or $gbpr.Length -ne 2476) {
    throw "DoK real-.GAM parity ($Label) FAILED: invalid GBPR header for the real 6-member roster"
  }
  if ([BitConverter]::ToUInt16($gbpr, 12) -ne 2 -or
      [BitConverter]::ToUInt16($gbpr, 14) -ne 1) {
    throw "DoK real-.GAM parity ($Label) FAILED: GBPR v2 title identity/schema must be DoK/1"
  }
  for ($i = 0; $i -lt 6; $i++) {
    $rec = 16 + $i * 410
    $meta = $rec + 1 + 216
    $source = [IO.File]::ReadAllBytes((Join-Path $realGamSource "CHRDATA$($i + 1).GAM"))
    for ($j = 0; $j -lt 216; $j++) {
      if ($gbpr[$rec + 1 + $j] -ne $source[$j]) {
        throw "DoK real-.GAM parity ($Label) FAILED: entry $i real body byte $j changed from retail source (want $($source[$j]) got $($gbpr[$rec + 1 + $j])) -- this is the case the /R fixture above could never exercise"
      }
    }
    if ([Text.Encoding]::ASCII.GetString($gbpr, $meta, 4) -ne 'GBD1') { throw "DoK real-.GAM parity ($Label) FAILED: entry $i lost its GBD1 tail" }
    $hp = Get-I16LE $gbpr ($meta + 6)
    $maxHp = Get-I16LE $gbpr ($meta + 26)
    if ($hp -ne $realDokHp[$i]) { throw "DoK real-.GAM parity ($Label) FAILED: entry $i DOK_META_HP changed (want $($realDokHp[$i]) got $hp) -- a DoK-aware consumer WOULD see this" }
    if ($maxHp -ne $realDokHp[$i]) { throw "DoK real-.GAM parity ($Label) FAILED: entry $i DOK_META_MAXHP changed (want $($realDokHp[$i]) got $maxHp) -- a DoK-aware consumer WOULD see this" }
  }
}

$realGamOut = Invoke-DokRealGam $shippedCom 'shipped' 300
Test-DokRealGamParity $realGamOut 'shipped'
$realGamAfter = Get-ChildItem $realGamSource -File | ForEach-Object {
  [PSCustomObject]@{ Name = $_.Name; Length = $_.Length; LastWriteTimeUtc = $_.LastWriteTimeUtc }
}
Compare-Object $realGamBaseline $realGamAfter -Property Name, Length, LastWriteTimeUtc | ForEach-Object {
  throw "retail SAVE folder changed during the real-.GAM parity check: $($_.Name) side=$($_.SideIndicator) -- CLAUDE.md forbids writing into game folders"
}
Write-Output 'DoK real-.GAM parity confirmed (shipped, real retail CHRDATA1..6.GAM, no /R): 216-byte bodies (incl. real non-zero byte 98) byte-identical to source, DOK_META_HP/MAXHP unchanged on all 6 real members, retail SAVE folder untouched (size+mtime baseline)'

# --- MUTATION-TEST the parity check itself: it must be able to FAIL. Build a
# second mutant that (a) removes rest_heal_party's rest_party+10 gate so DoK
# reaches the CoK-shaped healing branch, and (b) redirects the HP write from
# the always-unread offset 407 to DOK_META_HP's own low byte (216+6=222) --
# a field this same check just proved a DoK-aware consumer reads. If the
# check cannot catch that, it proves nothing above.
#
# There are now TWO rest_party+10/jne .done gates in this file (this item
# also found and fixed one in rest_write_party -- see native/README.md and
# the FINDING notes below); this mutant must remove ONLY rest_heal_party's,
# so the pattern disambiguates on what follows each gate (rest_heal_party's
# continues into 'mov cx, [rest_party+6]'; rest_write_party's into
# 'mov bp, [rest_party+6]').
$corruptPattern = 'cmp\s+word\s+\[rest_party\+10\],\s*0\s*\r?\n\s*jne\s+\.done\s*\r?\n(?=\s*mov\s+cx,\s*\[rest_party\+6\])'
$corruptMatches = [regex]::Matches($src, $corruptPattern).Count
if ($corruptMatches -ne 1) { throw "mutation setup: expected exactly 1 rest_heal_party DoK gate to remove, found $corruptMatches -- update this script's mutant" }
$writePattern = 'mov\s+\[si\+407\],\s*al'
$writeMatches = [regex]::Matches($src, $writePattern).Count
if ($writeMatches -ne 1) { throw "mutation setup: expected exactly 1 'mov [si+407], al' write site, found $writeMatches -- update this script's mutant" }
$corruptSrc = [regex]::Replace($src, $corruptPattern, '')
$corruptSrc = [regex]::Replace($corruptSrc, $writePattern, 'mov     [si+222], al')
$corruptSrcPath = Join-Path $run 'gbboot_corrupt.asm'
Set-Content -Path $corruptSrcPath -Value $corruptSrc -NoNewline -Encoding ASCII
$corruptCom = Join-Path $run 'GBBOOT_CORRUPT.COM'
$corruptLst = Join-Path $run 'gbboot_corrupt.lst'
& $nasm -f bin -I $srcInclude $corruptSrcPath -o $corruptCom -l $corruptLst
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $corruptCom)) { throw 'mutation setup: nasm failed to assemble the DOK_META_HP-corrupting mutant' }
Write-Output "corrupting mutant assembled: $corruptCom ($((Get-Item $corruptCom).Length) bytes) -- DoK gate removed, HP write redirected to DOK_META_HP low byte"

$corruptOut = Invoke-DokRealGam $corruptCom 'corrupt' 300
$caughtRed = $false
try {
  Test-DokRealGamParity $corruptOut 'corrupt'
} catch {
  $caughtRed = $true
  Write-Output "mutation-test RED confirmed: DoK real-.GAM parity check correctly FAILED against the DOK_META_HP-corrupting mutant ('$($_.Exception.Message)')"
}
if (-not $caughtRed) { throw 'MUTATION-TEST FAILED: the DOK_META_HP-corrupting mutant did not turn the real-.GAM parity check red -- the check cannot discriminate the case that matters' }

# Prove native/src/gbboot.asm itself was never touched by this mutation
# test -- the corrupt mutant is a STRING transform of $src assembled into
# native/build/gbdok-camp-rest-flow-test/gbboot_corrupt.asm, never written
# back over the real file, so "restore" here means "verify it never moved",
# by SHA-256, never by `git checkout --` (CLAUDE.md: a git restore on a
# shared file has destroyed a round of work here before). Then re-run the
# ALREADY-BUILT shipped binary ($shippedCom, built from this same
# unmodified source at the top of this script, and already proven GREEN
# above) against the identical real-.GAM fixture as confirmation.
$srcHashAfterMutation = (Get-FileHash $srcPath -Algorithm SHA256).Hash
if ($srcHashAtStart -ne $srcHashAfterMutation) { throw "native/src/gbboot.asm changed during the mutation test (start=$srcHashAtStart now=$srcHashAfterMutation) -- this must never happen" }
$shippedGreenOut = Invoke-DokRealGam $shippedCom 'restored' 300
Test-DokRealGamParity $shippedGreenOut 'restored'
Write-Output "mutation-test GREEN confirmed: native/src/gbboot.asm is byte-identical throughout (SHA-256 $srcHashAfterMutation) and the shipped (gated) binary passes the real-.GAM parity check again"

# ---------------------------------------------------------------------------
# 5a. Acceptance #5 (CoK side, real): FIND_ITEM finds a real, non-/I-seeded
#    STF-owned item via the same automatic write_seed_sidecar 'Q' import
#    DoK's Rest now shares camp code with (but does NOT share this specific
#    call -- see 5b). No /I flag anywhere in this invocation.
# ---------------------------------------------------------------------------
$cokRun = Join-Path $run 'cok-item'
if (Test-Path $cokRun) { Remove-Item -Recurse -Force $cokRun }
New-Item -ItemType Directory -Force (Join-Path $cokRun 'SAVE') | Out-Null
Copy-Item (Join-Path $cokGame 'KRYNN.CFG') (Join-Path $cokRun 'KRYNN.CFG') -Force
Write-SyntheticGeoDax (Join-Path $cokRun 'GEO1.DAX') 34

function Write-FindItemEclDax([string]$Path, [int]$ItemId) {
  $ecl = [System.Collections.Generic.List[byte]]::new()
  1..22 | ForEach-Object { [void]$ecl.Add([byte]0) }
  $ecl.AddRange([byte[]]@(0x21,0x00,34,0x00,0x02,0x00,0xFF))       # LOAD_FILES GEO block 34
  $ecl.AddRange([byte[]]@(0x09,0x00,0x00,0x01,0x00,0x52))          # SAVE 0 -> [0x5200]  (default: not found)
  $ecl.AddRange([byte[]]@(0x32,0x00,[byte]$ItemId))                # FIND_ITEM <ItemId>
  $ecl.Add([byte]0x16)                                             # IF_EQ (found)
  $ecl.AddRange([byte[]]@(0x09,0x00,0x01,0x01,0x00,0x52))          # SAVE 1 -> [0x5200]
  $ecl.Add([byte]0x00)                                             # HALT
  Write-SyntheticDaxBlocks $Path @(@{ Id = 34; Raw = $ecl.ToArray() })
}

$ownedItemId = 214   # deliberately distinct from every /I id used elsewhere in this suite
$sav = New-Object byte[] 409
$sav[0] = 1
[byte[]]$probeName = [Text.Encoding]::ASCII.GetBytes('PROBE')
[Array]::Copy($probeName, 0, $sav, 1, $probeName.Length)
[IO.File]::WriteAllBytes((Join-Path $cokRun 'SAVE\CHRDATA1.SAV'), $sav)
$stf = New-Object byte[] 63
$stf[0] = 1; $stf[0x2E] = $ownedItemId
[IO.File]::WriteAllBytes((Join-Path $cokRun 'SAVE\CHRDATA1.STF'), $stf)
[IO.File]::WriteAllBytes((Join-Path $cokRun 'SAVE\CHRDATA1.SFX'), [byte[]]@(0x12,0,0,0xFF,0,0,0,0,0))

function Read-EclMem([byte[]]$Fx, [int]$Addr) {
  $count = [BitConverter]::ToUInt16($Fx, 196)
  for ($k = 0; $k -lt $count; $k++) {
    if ([BitConverter]::ToUInt16($Fx, 198 + 2 * $k) -eq $Addr) { return [BitConverter]::ToUInt16($Fx, 1222 + 2 * $k) }
  }
  return $null
}

function Invoke-CokFindItem([int]$ItemId, [string]$Label) {
  Write-FindItemEclDax (Join-Path $cokRun 'ECL1.DAX') $ItemId
  foreach ($n in @('_GBPARTY.GBP', '_GBSEED.BIN', '_GBECL.BIN', 'COKFIND.TXT')) {
    Remove-Item -LiteralPath (Join-Path $cbin $n) -Force -ErrorAction SilentlyContinue
  }
  Copy-Item $shippedCom (Join-Path $cbin 'GBBOOT.COM') -Force
  $conf = Join-Path $build "_gbcok_finditem_$Label.conf"
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$cbin"
mount D "$cokRun"
D:
C:\GBBOOT /E /X /B 34 > C:\COKFIND.TXT
exit
"@ | Set-Content $conf -Encoding ASCII
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless
  if (-not $p.WaitForExit(30000)) { Stop-Process -Id $p.Id -Force; throw "CoK FIND_ITEM probe ($Label) timed out" }
  $out = Get-Content (Join-Path $cbin 'COKFIND.TXT') -Raw
  if ($out -like '*native preview failed*') { throw "CoK FIND_ITEM probe ($Label) failed to boot: $out" }
  $seed = [IO.File]::ReadAllBytes((Join-Path $cbin '_GBSEED.BIN'))
  if ([BitConverter]::ToUInt16($seed, 4) -ne 6) { throw "CoK FIND_ITEM probe ($Label): expected GBPS v6 (real owned-item bitmap present), got v$([BitConverter]::ToUInt16($seed,4))" }
  $fx = [IO.File]::ReadAllBytes((Join-Path $cbin '_GBECL.BIN'))
  return Read-EclMem $fx 0x5200
}

$foundReal = Invoke-CokFindItem $ownedItemId 'present'
if ($foundReal -ne 1) { throw "Acceptance #5 FAILED: FIND_ITEM($ownedItemId) did not find the real STF-owned item (not /I-seeded); got $foundReal" }
$foundAbsent = Invoke-CokFindItem ($ownedItemId + 1) 'absent'
if ($foundAbsent -ne 0) { throw "Acceptance #5 negative control FAILED: FIND_ITEM($($ownedItemId+1)), which the STF does NOT own, reported found ($foundAbsent) -- probe cannot discriminate" }
Write-Output "Acceptance #5 confirmed on CoK: FIND_ITEM($ownedItemId) finds a real STF-owned item with no /I flag anywhere in the invocation (GBPS v6, owned_items_valid path); FIND_ITEM($($ownedItemId+1)) on the same fixture correctly reports not-found"

# ---------------------------------------------------------------------------
# 5b. DoK side: confirm the real-inventory path is verifiably UNREACHED, not
#    silently broken. A normal DoK boot must produce a GBPS seed whose
#    version never reaches 6 (the write_seed_sidecar 'Q' import is gated
#    `cmp word [gamep], game_cok`, untouched by this item), so DoK's
#    FIND_ITEM stays on the legacy /I-only path -- inert, not wrong.
# ---------------------------------------------------------------------------
foreach ($n in @('_GBPARTY.GBP', '_GBSEED.BIN', 'DOKSEED.TXT')) {
  Remove-Item -LiteralPath (Join-Path $cbin $n) -Force -ErrorAction SilentlyContinue
}
Copy-Item $shippedCom (Join-Path $cbin 'GBBOOT.COM') -Force
$dokSeedConf = Join-Path $build '_gbdok_seed_version.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$cbin"
mount D "$run"
D:
C:\GBBOOT /E /X /R V_CLERIC C /R V_KNIGHT K /R V_MAGE M /R V_THIEF T > C:\DOKSEED.TXT
exit
"@ | Set-Content $dokSeedConf -Encoding ASCII
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $dokSeedConf -Headless
if (-not $p.WaitForExit(30000)) { Stop-Process -Id $p.Id -Force; throw 'DoK seed-version check timed out' }
$dokSeedOut = Get-Content (Join-Path $cbin 'DOKSEED.TXT') -Raw
if ($dokSeedOut -like '*native preview failed*') { throw "DoK seed-version check failed to boot: $dokSeedOut" }
$dokSeed = [IO.File]::ReadAllBytes((Join-Path $cbin '_GBSEED.BIN'))
$dokSeedVersion = [BitConverter]::ToUInt16($dokSeed, 4)
if ($dokSeedVersion -ge 6) { throw "DoK seed-version check FAILED: DoK boot produced GBPS v$dokSeedVersion -- the CoK-only 'Q' item-bitmap import is no longer exclusive to CoK, re-examine FIND_ITEM correctness for DoK before relying on this" }
Write-Output "DoK real-inventory path confirmed unreached: DoK boot produces GBPS v$dokSeedVersion (< 6), so FIND_ITEM for DoK stays on the legacy /I-only path -- inert (never silently wrong), consistent with CCINV's CoK-only SAVE\CHRDATA{n}.STF paths and write_seed_sidecar's CoK-only 'Q' import"

Write-Output 'RESULT: GBBOOT DoK camp/rest parity (menu gating, mutation-tested rest+checkpoint save+restore+game-id check, DoK heal-no-op finding on a /R fixture, mutation-tested real-retail-.GAM DOK_META parity check, CoK real-FIND_ITEM discriminator, DoK FIND_ITEM-unreached confirmation) PASS'
