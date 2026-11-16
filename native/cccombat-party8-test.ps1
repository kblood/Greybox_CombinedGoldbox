# CCCOMBAT GBPR row cap: DQK parties of 7 and 8 rows import and fight; a 9-row DQK roster and
# 7-row CoK/DoK rosters are refused.  Fixtures reuse the cccombat-dqkai layout (GBPR v2, 410-byte rows).
# Each case runs CCCOMBAT /E with the same effect/monster fixtures; the trace must name every party
# member p0..p(n-1) for an accepted roster and the run must exit nonzero for a refused one.
# The previous (HEAD) CCCOMBAT can be supplied with -OldCom to show the 7/8-row cases RED.
param(
  [switch]$Headless,
  [string]$NewCom = "",
  [string]$OldCom = ""
)
$ErrorActionPreference = "Stop"
$root = (Split-Path -Parent $PSScriptRoot)
$native = Join-Path $root "native"
$build = Join-Path $native "build"
$run = Join-Path $build "cccombat-party8-test"
$dosbox = Join-Path $root "The Dark Queen of Krynn\DOSBOX\DOSBox.exe"
. (Join-Path $native "dosbox-smoke.ps1")
if (-not (Test-Path $dosbox)) { Write-Host "SKIP: retail DOSBox missing"; exit 0 }
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { Write-Host "SKIP: python missing"; exit 0 }
if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null
if ($NewCom -eq "") {
  & (Join-Path $native "build.ps1") -Target cccombat
  if ($LASTEXITCODE -ne 0) { throw "cccombat build failed" }
  $NewCom = Join-Path $build "cccombat.com"
}
Copy-Item $NewCom (Join-Path $run "CCCOMBAT.COM") -Force
if ($OldCom -ne "") { Copy-Item $OldCom (Join-Path $run "CCOLD.COM") -Force }

$py = Join-Path $run "party8.py"
@'
import struct, sys
from pathlib import Path
RUN = Path(sys.argv[1]); MODE = sys.argv[2]; HAVE_OLD = sys.argv[3] == '1'
CASES = [  # tag, kind, rows, accepted
    ('D7', 'dqk', 7, True), ('D8', 'dqk', 8, True), ('D6', 'dqk', 6, True),
    ('D9', 'dqk', 9, False), ('K7', 'dok', 7, False), ('C7', 'cok', 7, False),
    ('K6', 'dok', 6, True), ('C6', 'cok', 6, True),
]

def dax(blocks):
    toc = b''; data = b''
    for bid, raw in blocks:
        comp = b''.join(bytes([len(raw[i:i+128])-1]) + raw[i:i+128] for i in range(0, len(raw), 128))
        toc += struct.pack('<BIHH', bid, len(data), len(raw), len(comp)); data += comp
    return struct.pack('<H', len(toc)) + toc + data

def monrec(hp):
    r = bytearray(216)
    r[31] = 45; r[95] = 50; r[89] = 1; r[91] = 4; r[90] = 0; r[41] = 1
    r[40] = r[214] = r[108] = hp; r[22] = r[23] = 10
    return bytes(r)

def body(name, hp, kind):
    b = bytearray(409)
    b[0] = len(name); b[1:1+len(name)] = name.encode()
    b[22] = 10
    if kind == 'cok':
        b[89] = 45; b[275] = 50; b[269] = 1; b[270] = 0; b[271] = 6; b[98] = hp; b[407] = hp
        return bytes(b)
    m = 216
    b[m:m+4] = b'GBD1'
    for off, val in ((4, 1), (6, hp), (8, 4), (10, 1), (12, 4), (14, 0), (16, 7), (20, 10), (22, 4), (26, hp)):
        struct.pack_into('<h', b, m+off, val)
    b[m+18] = 1
    return bytes(b)

def gbpr(n, kind):
    h = bytearray(16); h[:4] = b'GBPR'
    if kind == 'cok':
        struct.pack_into('<HHH', h, 4, 1, n, 410)
    else:
        struct.pack_into('<HHHHHH', h, 4, 2, n, 410, 1, {'dok': 2, 'dqk': 3}[kind], 1)
    out = bytes(h)
    for i in range(n):
        out += bytes([i + 1]) + body('P%d' % i, 200, kind)
    return out

def gbef(groups, seed=77):
    r = bytearray(130); r[:4] = b'GBEF'
    struct.pack_into('<HHH', r, 4, 9, 8, 3)
    struct.pack_into('<H', r, 32, len(groups))
    for g, (mid, copies) in enumerate(groups):
        struct.pack_into('<HHH', r, 34 + 6 * g, mid, copies, 0)
    r[116:120] = b'GBRS'
    struct.pack_into('<3HI', r, 120, 1, 34, 22, seed)
    return bytes(r)

def flagged(n):
    # DOSBox creates the redirect target even when the if branch is not taken, so only a non-empty file means nonzero exit
    f = RUN/n
    return f.exists() and f.stat().st_size > 0

def read(p):
    return Path(p).read_bytes() if Path(p).exists() else None

if MODE == 'prepare':
    (RUN/'AI.DAX').write_bytes(dax([(1, monrec(5)), (2, monrec(20)), (3, monrec(40))]))
    (RUN/'EQ.EFX').write_bytes(gbef([(1, 1), (2, 1), (3, 1)], 0xDEADBEEF))
    bat = ['@echo off']
    for tag, kind, n, ok in CASES:
        (RUN/f'{tag}.GBP').write_bytes(gbpr(n, kind))
        exes = [('N', 'CCCOMBAT')] + ([('O', 'CCOLD')] if HAVE_OLD else [])
        for pre, exe in exes:
            bat.append(f'{exe} /E EQ.EFX AI.DAX 4660 {pre}{tag}.TRC {pre}{tag}.OUT /P {tag}.GBP /R {pre}{tag}.GBR /J')
            bat.append(f'if errorlevel 1 echo x > {pre}{tag}.NZ')
    (RUN/'RUN.BAT').write_text('\r\n'.join(bat) + '\r\n', encoding='ascii')
else:
    def members(pre, tag):
        t = read(RUN/f'{pre}{tag}.TRC')
        if not t: return set()
        txt = t.decode('ascii', 'replace')
        return {w for ln in txt.splitlines() for w in ln.split() if len(w) >= 2 and w[0] == 'p' and w[1:].isdigit()}
    summary = []
    for tag, kind, n, ok in CASES:
        nz = flagged(f'N{tag}.NZ')
        mem = members('N', tag)
        if ok:
            assert not nz, ('accepted roster exited nonzero', tag)
            want = {'p%d' % i for i in range(n)}
            assert want <= mem, ('trace is missing party members', tag, sorted(want - mem))
        else:
            assert nz, ('refused roster exited zero', tag, sorted(mem))
            assert not mem, ('refused roster still placed party members', tag, sorted(mem))
        summary.append((tag, n, 'accepted' if ok else 'refused', len(mem)))
    if HAVE_OLD:
        red = []
        for tag in ('D7', 'D8'):
            om = members('O', tag)
            assert flagged(f'O{tag}.NZ') or len(om) < int(tag[1]), ('previous build unexpectedly handled', tag)
            red.append(tag)
        for tag in ('D6', 'K6', 'C6'):
            assert read(RUN/f'N{tag}.TRC') == read(RUN/f'O{tag}.TRC'), ('6-row identity vs previous build', tag)
        print('OLD build RED on', red, '; 6-row traces byte-identical new vs old')
    print('PASS:', summary)
'@ | Set-Content -LiteralPath $py -Encoding UTF8

$have = if ($OldCom -ne "") { "1" } else { "0" }
python -I $py $run prepare $have
if ($LASTEXITCODE -ne 0) { throw "fixture generation failed" }
$conf = Join-Path $run "probe.conf"
@"
[sdl]
fullscreen=false
autolock=false
[cpu]
cycles=fixed 60000
[autoexec]
@echo off
mount C "$run"
C:
call RUN.BAT
exit
"@ | Set-Content -LiteralPath $conf -Encoding ASCII
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless
if (-not $p.WaitForExit(600000)) { Stop-Process -Id $p.Id -Force; throw "DOSBox timed out" }
python -I $py $run verify $have
if ($LASTEXITCODE -ne 0) { throw "CCCOMBAT party-row cap mismatch" }
Write-Host "RESULT: CCCOMBAT DQK 7/8-row party, 9-row and CoK/DoK 7-row refusal PASS"
