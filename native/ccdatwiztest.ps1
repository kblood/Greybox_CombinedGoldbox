# ccdatwiztest.ps1 -- headless verification of the widened print_wiz tail loop
# (offsets 180-219 instead of the old fixed 188-191/212-215 slots). Pure
# stdout-redirect DOS batch, no keyboard/screen automation needed.
param(
  [switch]$Headless
)
$ErrorActionPreference = "Stop"

$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native "build"
$run = Join-Path $build "ccdat-wiz-test"
$saveDir = Join-Path $root "Death Knights of Krynn\SAVE"
$dokDir = Join-Path $root "Death Knights of Krynn"
$dosbox = Join-Path $root "Death Knights of Krynn\DOSBOX\DOSBox.exe"
. (Join-Path $native "dosbox-smoke.ps1")

& (Join-Path $native "build.ps1") -Target ccdat

New-Item -ItemType Directory -Force $build | Out-Null
if (Test-Path $run) {
    $resolvedBuild = (Resolve-Path -LiteralPath $build).Path
    $resolvedRun = (Resolve-Path -LiteralPath $run).Path
    if (-not $resolvedRun.StartsWith($resolvedBuild + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove unexpected run directory: $resolvedRun"
    }
    Remove-Item -LiteralPath $resolvedRun -Recurse -Force
}
New-Item -ItemType Directory -Force $run | Out-Null

Copy-Item (Join-Path $build "ccdat.com") (Join-Path $run "CCDAT.COM") -Force
Copy-Item (Join-Path $saveDir "CHRDATA1.WIZ") (Join-Path $run "CHRDATA1.WIZ") -Force
Copy-Item (Join-Path $saveDir "CHRDATA4.WIZ") (Join-Path $run "CHRDATA4.WIZ") -Force
Copy-Item (Join-Path $saveDir "CHRDATA5.WIZ") (Join-Path $run "NEDEIL.WIZ") -Force
Copy-Item (Join-Path $dokDir "MON1WIZ.DAX") (Join-Path $run "MON1WIZ.DAX") -Force

$conf = Join-Path $run "_ccdat_wiz.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[autoexec]
@echo off
mount C "$run"
C:
CCDAT.COM W CHRDATA4.WIZ > OUT4.TXT
CCDAT.COM W CHRDATA1.WIZ > OUT1.TXT
CCDAT.COM W NEDEIL.WIZ > OUTN.TXT
CCDAT.COM Z MON1WIZ.DAX 13 > MON97.TXT
exit
"@ | Set-Content -Path $conf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
    try { $p.Kill() } catch {}
    throw "DOSBox did not exit while running CCDAT WIZ verification"
}

function Assert-TextContains([string]$Path, [string[]]$Needles, [string]$Label) {
    if (-not (Test-Path $Path)) {
        throw "$Label failed: output missing"
    }
    $text = Get-Content $Path -Raw
    foreach ($needle in $Needles) {
        if (-not $text.Contains($needle)) {
            throw "$Label failed: missing '$needle'"
        }
    }
}

foreach ($f in @("OUT4.TXT","OUT1.TXT","OUTN.TXT","MON97.TXT")) {
    $path = Join-Path $run $f
    Write-Output "=== $f ==="
    if (Test-Path $path) { Get-Content $path } else { Write-Output "(missing)" }
}

Assert-TextContains (Join-Path $run "OUT1.TXT") @(
    "== DoK SPELL RECORD (CHRDATAn.WIZ, PARTIAL) ==",
    "isCaster: 0"
) "CCDAT WIZ non-caster smoke"
Assert-TextContains (Join-Path $run "OUT4.TXT") @(
    "== DoK SPELL RECORD (CHRDATAn.WIZ, PARTIAL) ==",
    "isCaster: 1",
    "-- knownSpell index: ",
    "-- tailByte index: "
) "CCDAT WIZ FLAVIUS smoke"
Assert-TextContains (Join-Path $run "OUTN.TXT") @(
    "== DoK SPELL RECORD (CHRDATAn.WIZ, PARTIAL) ==",
    "isCaster: 1",
    "-- knownSpell index: ",
    "-- tailByte index: "
) "CCDAT WIZ NEDEIL smoke"
Assert-TextContains (Join-Path $run "MON97.TXT") @(
    "== MONSTER SPELLBOOK TABLE (MON*WIZ.DAX) ==",
    "blockId(monsterId): 97",
    "-- memorizedSpell index: 0",
    "offset: 0",
    "spellId: 47",
    "learning: 0",
    "-- memorizedSpell index: 6",
    "spellId: 21"
) "CCDAT MON1WIZ IGORF smoke"

Write-Output "RESULT: CCDAT WIZ tail + MON1WIZ verification PASS"
