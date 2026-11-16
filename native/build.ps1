<#
  build.ps1 — assemble the Greybox native DOS engine.

  Toolchain (same as C:\LLM\cc): NASM emits the runnable binary directly with
  `-f bin` — a flat 16-bit .COM, one segment, no linker, no libc. The mode-13h
  framebuffer lives in video RAM (A000:0000), separate from the .COM's segment,
  so 256-colour graphics need nothing extra. We move to an OMF linker / .EXE only
  when the engine's own code+data outgrow the 64 KB segment (the build parses the
  NASM listing, including un-emitted reservations, so we'll see the wall coming).

  Usage:
    .\build.ps1                 # build the default target (pixel) -> build\pixel.com
    .\build.ps1 -Target pixel   # explicit
    .\build.ps1 -Target engine  # GBBOOT + native /E helper tools
    .\build.ps1 -Target all     # every native .COM target
    .\build.ps1 -Run            # build, then run under no-focus/headless DOSBox
    .\build.ps1 -Run -Visible   # debug with a normal DOSBox window
#>
param(
    [string]$Target = "pixel",
    [switch]$Run,
    [switch]$Headless,
    [switch]$Visible,
    [string]$Cycles
)
$ErrorActionPreference = "Stop"
$dir   = $PSScriptRoot
$build = Join-Path $dir "build"
New-Item -ItemType Directory -Force $build | Out-Null

$ComLimit = 65280
$ComWarn = 60000
# These are retained operating reserves, not the physical .COM limit.  Keep
# constrained programs from silently spending their last recovery/feature
# margin: the builder must fail before a below-floor image becomes an artifact.
$MinimumHeadroom = @{
    gbboot   = 128
    cccombat = 128
    ccecl    = 64
}
$CapacityRecords = [Collections.Generic.List[object]]::new()
$EngineTargets = @("gbboot", "ccparty", "ccinv", "ccecl", "ccflow", "ccbind", "ccefx", "cchost", "ccnext", "ccgeo", "ccfp", "cchlib", "cccombat", "ccdaa", "cgb", "ccdemo", "ccmenu")
$AllTargets = @(
    "pixel",
    "ccdat",
    "ccdemo",
    "ccmenu",
    "ccdaa",
    "ccecl",
    "ccflow",
    "ccbind",
    "ccefx",
    "cchost",
    "ccnext",
    "ccfp",
    "ccgeo",
    "ccglb",
    "cchlib",
    "ccmon",
    "ccparty",
    "ccinv",
    "ccsnd",
    "ccverify",
    "cgb",
    "cgbc",
    "cccombat",
    "gbmark",
    "gbmarkf",
    "gbboot"
)

# --- locate NASM (same install C:\LLM\cc uses) ------------------------------
$nasm = "C:\Users\Caldor\AppData\Local\bin\NASM\nasm.exe"
if (-not (Test-Path $nasm)) {
    $g = Get-Command nasm -ErrorAction SilentlyContinue
    if ($g) { $nasm = $g.Source } else { Write-Host "NASM not found."; exit 1 }
}

function Build-OneTarget {
    param([Parameter(Mandatory)][string]$Name)

    $src = Join-Path $dir "src\$Name.asm"
    if (-not (Test-Path $src)) { Write-Host "no source: $src"; exit 1 }
    $com = Join-Path $build "$Name.com"
    $lst = Join-Path $build "$Name.lst"

    Write-Host "nasm -f bin -> $com"
    $targetDefines = @()
    if ($Name -eq 'ccnext') { $targetDefines = @('-DCCNEXT_PUBLIC_FINAL=1') }
    & $nasm @targetDefines -f bin -I ((Join-Path $dir 'src') + '/') $src -o $com -l $lst
    if ($LASTEXITCODE -ne 0) { Write-Host "NASM failed ($LASTEXITCODE)"; exit 1 }

    # ------------------------------------------------------------------
    #  Resident-image size guard.
    #
    #  CORRECTED 2026-09-05, after it missed a real segment overrun that cost a
    #  day. This block used to be simply `max($sz, offset + bytes)`, which for a
    #  zero-based `section .bss` measures the .bss extent ALONE -- it never added
    #  the `org 100h` PSP or the emitted code. CCECL reported "46,757 resident"
    #  against a 65,280 limit and built clean while its true top was 66,223, i.e.
    #  687 bytes PAST the 64 KB segment. NASM truncated `mov sp, stacktop` to
    #  `mov sp, 0x02AF` with no diagnostic, putting the stack inside the program's
    #  own code; the first INT 21h then overwrote `load_block`, and it also
    #  clobbered `.die`'s `call puts`, so the failure could not even report
    #  itself. Every `CCECL <file>.BIN /E` silently produced nothing for weeks.
    #
    #  The two .bss idioms in native/src must be told apart, because the listing
    #  addresses mean different things and averaging them would be wrong in both
    #  directions:
    #    * `section .bss` (ccecl, ccdaa, ccdat, ccefx) restarts its addresses at
    #      zero, so the reserved offsets are RELATIVE and the code size must be
    #      added.
    #    * `absolute <label>` at the current flat offset (ccfp) continues the
    #      code's own addresses, so the offsets are ALREADY absolute file offsets
    #      and adding the code size would double-count. ccfp.asm:5649 documents
    #      choosing that idiom for exactly this reason.
    #  The discriminator is where the LOWEST reservation sits: at ~0 it is a
    #  zero-based section; at the code end it is already absolute.
    #
    #  NASM listing addresses are file offsets and exclude `org 100h`, so 0x100
    #  is added once, at the end, in both branches.
    # ------------------------------------------------------------------
    $sz = (Get-Item $com).Length
    $bssMax = 0
    $bssMin = [int]::MaxValue
    if (Test-Path $lst) {
        foreach ($line in Get-Content $lst) {
            if ($line -match '^\s*\d+\s+([0-9A-Fa-f]{8})\s+<res\s+([0-9A-Fa-f]+)h>') {
                $offset = [Convert]::ToInt32($matches[1], 16)
                $bytes = [Convert]::ToInt32($matches[2], 16)
                $bssMax = [Math]::Max($bssMax, $offset + $bytes)
                $bssMin = [Math]::Min($bssMin, $offset)
            }
        }
    }
    if ($bssMin -eq [int]::MaxValue) {
        $resident = 0x100 + $sz                      # no reservations at all
    } elseif ($bssMin -ge $sz) {
        $resident = 0x100 + $bssMax                  # absolute idiom: already past the code
    } else {
        $resident = 0x100 + $sz + $bssMax            # zero-based section .bss
    }

    if ($resident -gt $ComLimit) {
        Write-Host ("ERROR: {0} resident image is {1:N0} bytes; .COM segment limit is {2:N0} bytes" -f $com, $resident, $ComLimit)
        exit 1
    }
    $headroom = $ComLimit - $resident
    $minimum = 0
    if ($MinimumHeadroom.ContainsKey($Name)) { $minimum = $MinimumHeadroom[$Name] }
    if ($headroom -lt $minimum) {
        Write-Host ("ERROR: {0} has {1:N0} bytes headroom; documented minimum is {2:N0} bytes" -f $com, $headroom, $minimum)
        exit 1
    }
    if ($resident -gt $ComWarn) {
        Write-Host ("WARN: {0} resident image is {1:N0} bytes; .COM segment ceiling is {2:N0} bytes" -f $com, $resident, $ComLimit)
    }
    if ($resident -ne $sz) {
        Write-Host ("OK: {0}  ({1:N0} bytes emitted, {2:N0} bytes resident, {3:N0} bytes headroom)" -f $com, $sz, $resident, $headroom)
    } else {
        Write-Host ("OK: {0}  ({1:N0} bytes emitted, {2:N0} bytes headroom)" -f $com, $sz, $headroom)
    }
    $CapacityRecords.Add([pscustomobject][ordered]@{
        tool = $Name
        emitted_bytes = $sz
        resident_bytes = $resident
        headroom_bytes = $headroom
        minimum_headroom_bytes = $minimum
    })
    return $com
}

function Write-CapacityManifest {
    # Hash every assembled source and include path names, so a same-sized edit
    # cannot retain a plausible capacity record from a different native tree.
    $sourceRoot = Join-Path $dir 'src'
    $sourceFiles = [Collections.Generic.List[IO.FileInfo]]::new()
    foreach ($file in Get-ChildItem -LiteralPath $sourceRoot -File -Recurse) { $sourceFiles.Add($file) }
    # PowerShell's default sort follows the host locale (Danish treats `aa` as
    # a later letter); manifest hashes must be stable across developer locales.
    $sourceFiles.Sort([Comparison[IO.FileInfo]]{
        param($left, $right)
        [StringComparer]::Ordinal.Compare($left.FullName, $right.FullName)
    })
    $sourceLines = foreach ($file in $sourceFiles) {
        $relative = $file.FullName.Substring($sourceRoot.Length).TrimStart('\\').Replace('\\', '/')
        $digest = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        "$relative=$digest"
    }
    $sourceBytes = [Text.Encoding]::UTF8.GetBytes(($sourceLines -join "`n"))
    $sourceHash = ([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($sourceBytes))).ToLowerInvariant()
    $manifest = [ordered]@{
        schema = 1
        native_source_sha256 = $sourceHash
        com_limit_bytes = $ComLimit
        tools = @($CapacityRecords | Sort-Object tool)
    }
    $path = Join-Path $build 'native-capacity.json'
    $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $path -Encoding UTF8
    Write-Host "Capacity manifest: $path (native source $sourceHash)"
}

function Build-OptionalCoKMusic {
    $root = Split-Path -Parent $dir
    $source = Join-Path $root 'amiga_extracted\ChampionsOfKrynn\disk1\Sound\krynn'
    $converter = Join-Path $root 'tools\smus_to_gbm.py'
    $output = Join-Path $build 'COKTITLE.GBM'
    if ((Test-Path $source) -and (Test-Path $converter)) {
        & python $converter $source $output
        if ($LASTEXITCODE -ne 0) { Write-Host "optional CoK music conversion failed"; exit 1 }
    }
}

function Build-OptionalDqkMusic {
    $root = Split-Path -Parent $dir
    $source = Join-Path $root 'The Dark Queen of Krynn\DISK1\PCDQ1.XMI'
    $converter = Join-Path $root 'tools\xmi_to_gbm.py'
    $output = Join-Path $build 'DQKTITLE.GBM'
    if ((Test-Path $source) -and (Test-Path $converter)) {
        & python $converter $source $output
        if ($LASTEXITCODE -ne 0) { Write-Host "optional DQK music conversion failed"; exit 1 }
    }
}

function Build-OptionalDokMusic {
    $root = Split-Path -Parent $dir
    $source = Join-Path $root 'amiga_extracted\DeathKnightsOfKrynn\disk1\sound\krynn.smu'
    $converter = Join-Path $root 'tools\smus_to_gbm.py'
    $output = Join-Path $build 'DOKTITLE.GBM'
    if ((Test-Path $source) -and (Test-Path $converter)) {
        & python $converter $source $output
        if ($LASTEXITCODE -ne 0) { Write-Host "optional DoK music conversion failed"; exit 1 }
    }
}

$targetName = $Target.ToLowerInvariant()
if ($targetName -eq "engine") {
    if ($Run) { Write-Host "-Run requires a single target, not -Target engine"; exit 1 }
    foreach ($t in $EngineTargets) { Build-OneTarget $t | Out-Null }
    Build-OptionalCoKMusic
    Build-OptionalDokMusic
    Build-OptionalDqkMusic
    Write-CapacityManifest
    exit 0
}
if ($targetName -eq "all") {
    if ($Run) { Write-Host "-Run requires a single target, not -Target all"; exit 1 }
    foreach ($t in $AllTargets) { Build-OneTarget $t | Out-Null }
    Build-OptionalCoKMusic
    Build-OptionalDokMusic
    Build-OptionalDqkMusic
    Write-CapacityManifest
    exit 0
}

$com = Build-OneTarget $targetName
Write-CapacityManifest

if ($Run) {
    $db = Get-Command dosbox -ErrorAction SilentlyContinue
    if (-not $db) { $db = Get-Command dosbox-x -ErrorAction SilentlyContinue }
    $gameBundled = Join-Path (Split-Path -Parent $dir) "The Dark Queen of Krynn\DOSBOX\DOSBox.exe"
    $bundled = "C:\LLM\DOS\cc\dosbox-x\dosbox-x.exe"
    if (Test-Path $gameBundled) {
        $dbExe = $gameBundled
    } elseif (-not $db -and (Test-Path $bundled)) {
        $dbExe = $bundled
    } elseif ($db) {
        $dbExe = $db.Source
    }
    if ($dbExe) {
        . (Join-Path $dir "dosbox-smoke.ps1")
        $runConf = Join-Path $build ("_run_{0}.conf" -f $targetName)
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
C:
$targetName.com
exit
"@ | Set-Content -Path $runConf -Encoding ASCII
        $p = Start-DosBoxSmoke -Dosbox $dbExe -Conf $runConf -Visible:$Visible -Headless:$Headless -Cycles $Cycles
        if ($Visible) {
            $p.WaitForExit()
        } elseif (-not $p.WaitForExit(60000)) {
            try { $p.Kill() } catch {}
            throw "DOSBox did not exit while running $targetName.com"
        }
    } else {
        Write-Host "DOSBox not found - run $com manually under DOS/DOSBox."
    }
}
exit 0
