# cccombat-dokinit-test.ps1 -- DoK per-round initiative in CCCOMBAT vs the retail rule.
#
# The expected turn order is derived by tools/dok_initiative.py (the Unicorn-oracle-verified
# retail rule), NEVER from CCCOMBAT output:
#   delay = max(1, d6 + DexReactionAdj(dex)); surprised team -6; outside 0..20 -> 0;
#   one insertion sort per round, highest first, tie = dice(1,2) coin.
# Round-1 only is compared exactly (later rounds interleave attack RNG draws the model does not
# simulate).  RNG: under /J CCCOMBAT uses the shared Borland recurrence (state*08088405h+1,
# (state>>16) mod bound) == tools/dok_rng.py; without /J it uses its legacy LCG
# (state*1664525+1013904223, state mod bound), modelled here by swapping dok_rng.bounded.
#
# Second half: CoK byte-identity (DQK is a difference control since the random-target AI).  The same fixtures run through the BASE build of CCCOMBAT
# (git rev $BaseRev) and the new one; every _GBCOMB-style .TRC/.GBR must be byte-equal, while a
# DoK-party run must DIFFER (the control that proves the comparison can see the change).
#
# -NewCom overrides the COM under test (used by the mutation runs); -SkipEquivalence skips half 2.
param(
  [switch]$Headless,
  [string]$NewCom = "",
  [string]$BaseRev = "36550b58",
  [switch]$SkipEquivalence
)
$ErrorActionPreference = "Stop"
$root = (Split-Path -Parent $PSScriptRoot)
$native = Join-Path $root "native"
$build = Join-Path $native "build"
$run = Join-Path $build "cccombat-dokinit-test"
$dosbox = Join-Path $root "The Dark Queen of Krynn\DOSBOX\DOSBox.exe"
. (Join-Path $native "dosbox-smoke.ps1")
if (-not (Test-Path $dosbox)) { Write-Host "SKIP: retail DOSBox missing"; exit 0 }
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { Write-Host "SKIP: python missing"; exit 0 }
$nasm = "C:\Users\Caldor\AppData\Local\bin\NASM\nasm.exe"
if (-not (Test-Path $nasm)) { $g = Get-Command nasm -ErrorAction SilentlyContinue; if ($g) { $nasm = $g.Source } else { Write-Host "SKIP: NASM missing"; exit 0 } }

if ($NewCom -eq "") {
  & (Join-Path $native "build.ps1") -Target cccombat
  if ($LASTEXITCODE -ne 0) { throw "cccombat build failed" }
  $NewCom = Join-Path $build "cccombat.com"
}
if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null
Copy-Item $NewCom (Join-Path $run "CCCOMBAT.COM") -Force

# Base build (CoK/DQK identity control): assemble the base revision's source with its own includes.
$haveBase = $false
if (-not $SkipEquivalence) {
  $baseSrc = Join-Path $run "base-src"
  New-Item -ItemType Directory -Force $baseSrc | Out-Null
  Push-Location $root
  try {
    # Use a file archive: Windows' default bsdtar rejects --force-local, and
    # a native binary pipe can fail before the equivalence control runs.
    $baseZip = Join-Path $baseSrc 'source.zip'
    git archive --format=zip --output=$baseZip $BaseRev native/src
    if ($LASTEXITCODE -ne 0) { throw "base revision $BaseRev not available for the CoK/DQK identity control" }
    Expand-Archive -LiteralPath $baseZip -DestinationPath $baseSrc -Force
    $baseSrc = Join-Path $baseSrc "native\src"
    if ($LASTEXITCODE -eq 0 -and (Test-Path (Join-Path $baseSrc "cccombat.asm"))) {
      & $nasm -f bin -I ($baseSrc + "/") (Join-Path $baseSrc "cccombat.asm") -o (Join-Path $run "CCOLD.COM")
      if ($LASTEXITCODE -ne 0) { throw "base cccombat assemble failed" }
      $haveBase = $true
    }
  } finally { Pop-Location }
  if (-not $haveBase) { throw "base revision $BaseRev not available for the CoK/DQK identity control" }
}

$py = Join-Path $run "dokinit.py"
@'
import json, random, struct, sys, re
from pathlib import Path

ROOT = Path(sys.argv[1]); RUN = Path(sys.argv[2]); MODE = sys.argv[3]
sys.path.insert(0, str(ROOT))
from tools import dok_initiative as di, dok_rng

DEXPOOL = (0, 2, 3, 4, 5, 9, 10, 10, 10, 15, 16, 17, 18, 19, 21, 24, 25, 26, 30)
MONDEX = {1: 0, 2: 9, 3: 17, 4: 22}


def dax(blocks):
    toc = b''; data = b''
    for bid, raw in blocks:
        comp = b''.join(bytes([len(raw[i:i+128])-1]) + raw[i:i+128] for i in range(0, len(raw), 128))
        toc += struct.pack('<BIHH', bid, len(data), len(raw), len(comp)); data += comp
    return struct.pack('<H', len(toc)) + toc + data


def monrec(dex):
    r = bytearray(216)
    r[31] = 45; r[95] = 50; r[89] = 1; r[91] = 4; r[90] = 0; r[41] = 1
    r[40] = r[214] = r[108] = 90; r[22] = r[23] = dex
    return bytes(r)


def partybody(name, dex, cok=False):
    b = bytearray(409)
    b[0] = len(name); b[1:1+len(name)] = name.encode()
    b[22] = dex
    if cok:
        b[89] = 45; b[275] = 50; b[269] = 1; b[270] = 0; b[271] = 6; b[98] = 30; b[407] = 30
    else:
        m = 216
        b[m:m+4] = b'GBD1'
        for off, val in ((4, 1), (6, 30), (8, 4), (10, 1), (12, 8), (14, 0), (16, 7), (20, 10), (22, 4), (26, 30)):
            struct.pack_into('<h', b, m+off, val)
        b[m+18] = 1
    return bytes(b)


def gbpr(dexes, kind):
    bodies = [partybody('P%d' % i, d, cok=(kind == 'cok')) for i, d in enumerate(dexes)]
    h = bytearray(16)
    h[:4] = b'GBPR'
    if kind == 'cok':
        struct.pack_into('<HHH', h, 4, 1, len(bodies), 410)
    else:
        struct.pack_into('<HHHHHH', h, 4, 2, len(bodies), 410, 1, {'dok': 2, 'dqk': 3}[kind], 1)
    out = bytes(h)
    for i, b in enumerate(bodies):
        out += bytes([i+1]) + b
    return out


def gbef(seed, groups):
    r = bytearray(130)
    r[:4] = b'GBEF'
    struct.pack_into('<HHH', r, 4, 9, 8, 3)
    struct.pack_into('<H', r, 32, len(groups))
    for g, (mid, copies) in enumerate(groups):
        struct.pack_into('<HHH', r, 34+6*g, mid, copies, 0)
    r[116:120] = b'GBRS'
    struct.pack_into('<3HI', r, 120, 1, 34, 22, seed)
    return bytes(r)


def configs():
    rng = random.Random(0x10071007)
    out = []
    # designed cases first
    out.append(dict(name='tie9', party=[10]*6, groups=[(2, 3)], surprise=0, seed=0x1234ABCD, rng='borland'))
    out.append(dict(name='surpP', party=[10, 16, 19, 3], groups=[(1, 1), (3, 2)], surprise=1, seed=0x0BADF00D, rng='borland'))
    out.append(dict(name='surpE', party=[10, 25, 5], groups=[(4, 2), (2, 2)], surprise=2, seed=0x00C0FFEE, rng='borland'))
    out.append(dict(name='surpB', party=[18, 18, 2], groups=[(3, 3)], surprise=3, seed=77, rng='borland'))
    while len(out) < 24:
        n = rng.randint(1, 6)
        groups = [(rng.randint(1, 4), rng.randint(1, 3)) for _ in range(rng.randint(1, 3))]
        out.append(dict(name='r%02d' % len(out), party=[rng.choice(DEXPOOL) for _ in range(n)], groups=groups,
                        surprise=rng.choice((0, 0, 1, 2, 3)), seed=rng.getrandbits(32), rng='borland'))
    for i in range(4):
        n = rng.randint(2, 6)
        out.append(dict(name='L%02d' % i, party=[rng.choice(DEXPOOL) for _ in range(n)], groups=[(rng.randint(1, 4), rng.randint(1, 3))],
                        surprise=rng.choice((0, 1, 2)), seed=rng.getrandbits(16), rng='legacy'))
    for i, c in enumerate(out):
        c['id'] = 'C%02d' % i
    return out


def lcg_bounded(state, bound, multiplier=None):
    state = (state*1664525 + 1013904223) & 0xFFFFFFFF
    return state, (state % bound if bound else 0)


class Counter:
    def __init__(self):
        self.coin = 0
    def wrap(self):
        orig = dok_rng.dice
        def dice(state, count, sides, *a, **k):
            if sides == 2:
                self.coin += 1
            return orig(state, count, sides, *a, **k)
        dok_rng.dice = dice
        return orig


def expect(c, counter):
    comb = [(0, d) for d in c['party']]
    for mid, copies in c['groups']:
        comb += [(1, MONDEX[mid])] * copies
    ids = []; ps = es = 0
    for side, _ in comb:
        if side == 0: ids.append('p%d' % ps); ps += 1
        else: ids.append('e%d' % es); es += 1
    saved = dok_rng.bounded
    if c['rng'] == 'legacy':
        dok_rng.bounded = lcg_bounded
    try:
        state = c['seed']; delays = []
        for side, dex in comb:
            state, d = di.roll_delay(state, dex, 1, side, c['surprise'])
            delays.append(d)
        before = counter.coin
        state, order = di.build_order(state, delays)
    finally:
        dok_rng.bounded = saved
    return [(ids[i], delays[i]) for i in order], delays, counter.coin - before


def prepare():
    RUN.mkdir(parents=True, exist_ok=True)
    (RUN/'DOKINIT.DAX').write_bytes(dax([(i, monrec(d)) for i, d in MONDEX.items()]))
    bat = ['@echo off']
    cfgs = configs()
    for c in cfgs:
        i = c['id']
        (RUN/f'{i}.GBP').write_bytes(gbpr(c['party'], 'dok'))
        (RUN/f'{i}.EFX').write_bytes(gbef(c['seed'], c['groups']))
        if c['rng'] == 'borland':
            bat.append(f'CCCOMBAT /E {i}.EFX DOKINIT.DAX 4660 {i}.TRC {i}.OUT /P {i}.GBP /R {i}.GBR /J /U {c["surprise"]}')
        else:
            bat.append(f'CCCOMBAT /E {i}.EFX DOKINIT.DAX {c["seed"]} {i}.TRC {i}.OUT /P {i}.GBP /U {c["surprise"]}')
    json.dump(cfgs, open(RUN/'cfgs.json', 'w'))
    if (RUN/'CCOLD.COM').exists():
        # CoK/DQK identity fixtures: same GBEF + monsters through BASE (O*) and NEW (N*)
        (RUN/'COK.GBP').write_bytes(gbpr([10, 12, 16], 'cok'))
        (RUN/'DQK.GBP').write_bytes(gbpr([10, 12, 16], 'dqk'))
        (RUN/'DOKP.GBP').write_bytes(gbpr([10, 12, 16], 'dok'))
        (RUN/'EQ.EFX').write_bytes(gbef(0xDEADBEEF, [(2, 2), (3, 1)]))
        for t in range(0, 61):
            bat.append(f'CCCOMBAT /T {t} 4660 N{t}.TRC /R N{t}.GBR')
            bat.append(f'CCOLD /T {t} 4660 O{t}.TRC /R O{t}.GBR')
        for tag, party in (('COKJ', 'COK'), ('DQKJ', 'DQK'), ('DOKJ', 'DOKP')):
            for pre, exe in (('N', 'CCCOMBAT'), ('O', 'CCOLD')):
                bat.append(f'{exe} /E EQ.EFX DOKINIT.DAX 4660 {pre}{tag}.TRC {pre}{tag}.OUT /P {party}.GBP /R {pre}{tag}.GBR /J')
        for tag, party in (('COKL', 'COK'), ('DQKL', 'DQK'), ('DOKL', 'DOKP'), ('NOPL', '')):
            for pre, exe in (('N', 'CCCOMBAT'), ('O', 'CCOLD')):
                p = f' /P {party}.GBP' if party else ''
                bat.append(f'{exe} /E EQ.EFX DOKINIT.DAX 4660 {pre}{tag}.TRC {pre}{tag}.OUT{p}')
    (RUN/'RUN.BAT').write_text('\r\n'.join(bat) + '\r\n', encoding='ascii')


def read(p):
    return Path(p).read_bytes() if Path(p).exists() else None


def verify():
    cfgs = json.load(open(RUN/'cfgs.json'))
    counter = Counter(); orig = counter.wrap()
    try:
        total_coin = 0; surprised_zero = 0; distinct_orders = set(); results = []
        for c in cfgs:
            want, delays, coin = expect(c, counter)
            total_coin += coin
            trace = (RUN/f"{c['id']}.TRC").read_text()
            got = [(m.group(1), int(m.group(2))) for m in re.finditer(r'(?m)^1 order (\S+) (\d+) - - - - - -\r?$', trace)]
            assert got == want, (c['id'], c['name'], 'expected', want, 'got', got)
            if c['surprise'] and 0 in delays: surprised_zero += 1
            distinct_orders.add(tuple(a for a, _ in want))
            results.append((c['id'], c['name'], c['rng'], c['surprise'], len(want), coin))
        assert total_coin >= 3, ('model exercised too few ties', total_coin)
        assert any(c['rng'] == 'borland' and c['surprise'] and 0 in expect(c, counter)[1] for c in cfgs), 'no surprise config produced delay 0'
        tie = [r for r in results if r[1] == 'tie9'][0]
        assert tie[5] >= 1, 'designed tie case flipped no coin'
        # second-round structure: delays are re-rolled, so a long combat shows more than one order block
        longest = max((len(re.findall(r'(?m)^\d+ order ', (RUN/f"{c['id']}.TRC").read_text())) for c in cfgs))
        print('PASS: %d configs, %d coin flips, %d surprise-zero configs, %d distinct orders, max order lines %d'
              % (len(cfgs), total_coin, surprised_zero, len(distinct_orders), longest))
    finally:
        dok_rng.dice = orig
    if (RUN/'CCOLD.COM').exists():
        same = []
        for t in range(0, 61):
            for ext in ('TRC', 'GBR'):
                a, b = read(RUN/f'N{t}.{ext}'), read(RUN/f'O{t}.{ext}')
                assert a == b, ('/T identity', t, ext, None if a is None else len(a), None if b is None else len(b))
            same.append(t)
        n_bytes = 0
        for tag in ('COKJ', 'COKL', 'NOPL'):
            for ext in ('TRC', 'OUT', 'GBR'):
                a, b = read(RUN/f'N{tag}.{ext}'), read(RUN/f'O{tag}.{ext}')
                assert a == b, ('identity', tag, ext)
                n_bytes += len(a or b'')
        for tag in ('DOKJ', 'DOKL'):
            assert read(RUN/f'N{tag}.TRC') != read(RUN/f'O{tag}.TRC'), ('control: DoK trace must differ', tag)
            assert b' order ' in read(RUN/f'N{tag}.TRC') and b' order ' not in read(RUN/f'O{tag}.TRC')
        # DQK is NOT an identity case any more: its computer-controlled turns pick uniformly at random among
        # the in-reach foes (retail 0x2DE10 rule, docs/engine/research/dqk-npc-ai-body.md 4.2), which draws
        # from the RNG where the base build's weakest-foe rule did not.  So the DQK trace must DIFFER from
        # the base build's, while still carrying no DoK per-round ' order ' lines (the initiative change
        # stays DoK-only).  This is the control that proves the comparison can see the AI change.
        for tag in ('DQKJ', 'DQKL'):
            assert read(RUN/f'N{tag}.TRC') != read(RUN/f'O{tag}.TRC'), ('control: DQK trace must differ (random target pick)', tag)
            assert read(RUN/f'N{tag}.TRC') and read(RUN/f'O{tag}.TRC'), ('empty DQK trace', tag)
        for tag in ('COKJ', 'DQKJ', 'COKL', 'DQKL', 'NOPL'):
            assert b' order ' not in read(RUN/f'N{tag}.TRC'), tag
        t_bytes = sum(len(read(RUN/f'N{t}.TRC') or b'') for t in range(0, 61))
        print('PASS: CoK/DQK identity: /T 0..60 (%d trace bytes) + 3 /E configs (%d bytes) byte-equal old vs new; DoK and DQK controls differ' % (t_bytes, n_bytes))


{'prepare': prepare, 'verify': verify}[MODE]()
'@ | Set-Content -LiteralPath $py -Encoding UTF8

python -I $py $root $run prepare
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
python -I $py $root $run verify
if ($LASTEXITCODE -ne 0) { throw "CCCOMBAT DoK initiative mismatch" }
Write-Host "RESULT: CCCOMBAT DoK per-round initiative PASS"
