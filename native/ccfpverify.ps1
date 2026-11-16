$GbRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
. "$GbRoot\tools\dosbot\lib.ps1"
$mount = (Join-Path $PSScriptRoot 'build\ccfpv')
$bake  = (Join-Path $PSScriptRoot 'build\ccshots')
New-Item -ItemType Directory -Force $mount | Out-Null
Copy-Item $GbRoot\native\build\ccfp.com $mount -Force
Copy-Item (Join-Path $bake "WALLS.BIN") $mount -Force
Copy-Item "$GbRoot\Champions of Krynn\8X8D1.DAX" $mount -Force
Copy-Item "$GbRoot\Champions of Krynn\WALLDEF1.DAX" $mount -Force
# remove any stale dumps
foreach ($f in "RESOLVE.BIN","TILES.BIN","PAL.BIN") { Remove-Item (Join-Path $mount $f) -ErrorAction SilentlyContinue }

$p = Start-Dosbox -MountDir $mount -Exe "ccfp.com" -ExeArgs "WALLS.BIN 8 13 4 /R"
$h = Wait-DosboxWindow -Proc $p -TimeoutSec 15
Start-Sleep -Seconds 4
Stop-Dosbox -Proc $p

function Diff-Bin($name) {
  $a = Join-Path $mount $name; $b = Join-Path $bake $name
  if (-not (Test-Path $a)) { Write-Output "$name : MISSING (asm did not dump it)"; return }
  $ba = [System.IO.File]::ReadAllBytes($a); $bb = [System.IO.File]::ReadAllBytes($b)
  if ($ba.Length -ne $bb.Length) { Write-Output ("$name : SIZE DIFF asm={0} bake={1}" -f $ba.Length,$bb.Length); return }
  $mis = 0; for ($i=0;$i -lt $ba.Length;$i++){ if ($ba[$i] -ne $bb[$i]){ $mis++ } }
  if ($mis -eq 0) { Write-Output ("$name : MATCH ({0} bytes)" -f $ba.Length) }
  else { Write-Output ("$name : {0} byte mismatches of {1}" -f $mis,$ba.Length) }
}
Diff-Bin "RESOLVE.BIN"
Diff-Bin "TILES.BIN"
Diff-Bin "PAL.BIN"
