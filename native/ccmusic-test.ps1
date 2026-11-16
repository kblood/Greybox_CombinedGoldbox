# CoK/DoK/DQK source music -> GBM1 -> timed native PC-speaker playback smoke.
param(
  [switch]$Headless,
  # Negative control: flip one byte of the STAGED CoK source after staging and
  # before the integrity check, to prove the payload checks can go RED.
  [switch]$MutateStagedSource
)
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$source = Join-Path $root 'amiga_extracted\ChampionsOfKrynn\disk1\Sound\krynn'
$converter = Join-Path $root 'tools\smus_to_gbm.py'
$dokSource = Join-Path $root 'amiga_extracted\DeathKnightsOfKrynn\disk1\sound\krynn.smu'
# Fallback: the read-only WHDLoad unpacked pack (never vendored). Sources are
# copied under native\build\_music_src and only the copy is read.
$whdRoot = 'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDLoad Collection\Games-WHDLoad\unpacked'
$whdCok = Join-Path $whdRoot 'ChampionsOfKrynn\data\Sound\krynn'
$whdDok = Join-Path $whdRoot 'DeathKnightsOfKrynn\data\sound\krynn.smu'
$srcStage = Join-Path $build '_music_src'
function Use-StagedSource([string]$Primary, [string]$Whd, [string]$Name) {
  $from = if (Test-Path -LiteralPath $Primary -PathType Leaf) { $Primary }
          elseif (Test-Path -LiteralPath $Whd -PathType Leaf) { $Whd } else { return $null }
  New-Item -ItemType Directory -Force -Path $srcStage | Out-Null
  $to = Join-Path $srcStage $Name
  Copy-Item -LiteralPath $from -Destination $to -Force
  $h = (Get-FileHash -LiteralPath $from -Algorithm SHA256).Hash
  [pscustomobject]@{ Path = $to; Origin = $from; Sha256 = $h }
}
$cokStaged = Use-StagedSource $source $whdCok 'cok_krynn'
$dokStaged = Use-StagedSource $dokSource $whdDok 'dok_krynn.smu'
if ($cokStaged) { $source = $cokStaged.Path }
if ($dokStaged) { $dokSource = $dokStaged.Path }
$dqkSource = Join-Path $root 'The Dark Queen of Krynn\DISK1\PCDQ1.XMI'
$dqkConverter = Join-Path $root 'tools\xmi_to_gbm.py'
$game = Join-Path $root 'Champions of Krynn'
# Mount a scratch mirror, never the retail release itself: `mount D "$game"`
# followed by `D:` makes the read-only GOG folder the DOS child's current drive,
# so its stray writes (CCFP.MOV, rewritten SAVE\CHRDATA*) land in the retail
# tree. CLAUDE.md: game-data folders are read-only source.
. (Join-Path $PSScriptRoot 'retail-stage.ps1')
$gameMount = if (Test-Path -LiteralPath $game -PathType Container) { New-RetailStage -Source $game } else { $game }
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'

foreach ($path in @($source, $converter, (Join-Path $game 'TITLE.DAX'))) {
  if (-not (Test-Path $path)) {
    Write-Output "SKIP: CCGB music smoke ($path absent)"
    exit 0
  }
}

if ($MutateStagedSource -and $cokStaged) {
  $b = [IO.File]::ReadAllBytes($cokStaged.Path); $b[0] = $b[0] -bxor 0xFF
  [IO.File]::WriteAllBytes($cokStaged.Path, $b)
}
foreach ($st in @($cokStaged, $dokStaged)) {
  if (-not $st) { continue }
  $now = (Get-FileHash -LiteralPath $st.Path -Algorithm SHA256).Hash
  Write-Output "SOURCE: $($st.Origin) sha256=$($st.Sha256) staged=$now"
  if ($now -ne $st.Sha256) { throw "Staged music source $($st.Path) differs from origin (payload integrity)" }
}
& python $converter $source (Join-Path $build 'COKTITLE.GBM')
if ($LASTEXITCODE -ne 0) { throw 'SMUS to GBM1 conversion failed' }
$hasDokMusic = Test-Path $dokSource
if ($hasDokMusic) {
  & python $converter $dokSource (Join-Path $build 'DOKTITLE.GBM')
  if ($LASTEXITCODE -ne 0) { throw 'DoK SMUS to GBM1 conversion failed' }
}
$hasDqkMusic = (Test-Path $dqkSource) -and (Test-Path $dqkConverter)
if ($hasDqkMusic) {
  & python $dqkConverter $dqkSource (Join-Path $build 'DQKTITLE.GBM')
  if ($LASTEXITCODE -ne 0) { throw 'XMI to GBM1 conversion failed' }
}
& (Join-Path $native 'build.ps1') -Target cgb
. (Join-Path $native 'dosbox-smoke.ps1')

$gbm = [IO.File]::ReadAllBytes((Join-Path $build 'COKTITLE.GBM'))
$count = [BitConverter]::ToUInt16($gbm, 4)
if ([Text.Encoding]::ASCII.GetString($gbm, 0, 4) -ne 'GBM1' -or $count -lt 2 -or
    $gbm.Length -ne 6 + 4 * $count) { throw 'Invalid generated GBM1 stream' }

$dqkCount = 0
$dokCount = 0
if ($hasDokMusic) {
  $dokGbm = [IO.File]::ReadAllBytes((Join-Path $build 'DOKTITLE.GBM'))
  $dokCount = [BitConverter]::ToUInt16($dokGbm, 4)
  if ([Text.Encoding]::ASCII.GetString($dokGbm, 0, 4) -ne 'GBM1' -or $dokCount -lt 2 -or
      $dokGbm.Length -ne 6 + 4 * $dokCount) { throw 'Invalid generated DoK GBM1 stream' }
}
if ($hasDqkMusic) {
  $dqkGbm = [IO.File]::ReadAllBytes((Join-Path $build 'DQKTITLE.GBM'))
  $dqkCount = [BitConverter]::ToUInt16($dqkGbm, 4)
  if ([Text.Encoding]::ASCII.GetString($dqkGbm, 0, 4) -ne 'GBM1' -or $dqkCount -lt 2 -or
      $dqkGbm.Length -ne 6 + 4 * $dqkCount) { throw 'Invalid generated DQK GBM1 stream' }
}

$dokLine = ''
if ($hasDokMusic) {
  $dokLine = 'C:\CGB /A /M C:\DOKTITLE.GBM > C:\DOKMUSIC.TXT'
}
$dqkLine = ''
if ($hasDqkMusic) {
  $dqkLine = 'C:\CGB /A /M C:\DQKTITLE.GBM > C:\DQKMUSIC.TXT'
}
$conf = Join-Path $build '_ccmusic_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[speaker]
pcspeaker=true
[autoexec]
@echo off
mount C "$build"
mount D "$gameMount"
D:
C:\CGB /A TITLE.DAX 0 /M C:\COKTITLE.GBM > C:\MUSIC.TXT
$dokLine
$dqkLine
exit
"@ | Set-Content $conf -Encoding ASCII
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(20000)) { Stop-Process -Id $p.Id -Force; throw 'CCGB music smoke timed out' }
$text = Get-Content (Join-Path $build 'MUSIC.TXT') -Raw
if ($text -notlike '*GBM1 PC-speaker sequence advanced*') { throw 'Native GBM1 sequence did not advance' }
if ($hasDokMusic) {
  $dokText = Get-Content (Join-Path $build 'DOKMUSIC.TXT') -Raw
  if ($dokText -notlike '*GBM1 PC-speaker sequence advanced*') { throw 'Native DoK GBM1 music-only sequence did not advance' }
}
if ($hasDqkMusic) {
  $dqkText = Get-Content (Join-Path $build 'DQKMUSIC.TXT') -Raw
  if ($dqkText -notlike '*GBM1 PC-speaker sequence advanced*') { throw 'Native DQK GBM1 music-only sequence did not advance' }
  $dokPart = if ($hasDokMusic) { "DoK SMUS -> $dokCount-event GBM1 music-only playback and " } else { "" }
  Write-Output "RESULT: CoK SMUS -> $count-event GBM1 image playback, ${dokPart}DQK XMI -> $dqkCount-event GBM1 music-only playback PASS"
} else {
  $dokPart = if ($hasDokMusic) { " and DoK SMUS -> $dokCount-event GBM1 music-only playback" } else { "" }
  Write-Output "RESULT: CoK SMUS -> $count-event GBM1 -> PC-speaker title playback$dokPart PASS"
  Write-Output "SKIP: DQK XMI music-only smoke ($dqkSource absent)"
}
