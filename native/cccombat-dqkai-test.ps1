# cccombat-dqkai-test.ps1 -- DQK computer-controlled target selection in CCCOMBAT vs the retail rule.
#
# Retail rule (docs/engine/research/dqk-npc-ai-body.md 4.2, READ from the 0x2DE10 AI body, not from
# CCCOMBAT): find_target (21e4:3D9E) and the attack stage 0x2E94D pick uniformly at random among the
# in-reach hostile foes with roll(count,1) -- no HP, AC or distance preference -- and the attack stage
# drops a stored target whose side (+0x66) is 0, so a monster re-selects before each swing.
# CCCOMBAT gates this on the DQK profile (GBPR title kind 3, or the CCECL D0xx handoff tag); CoK/DoK
# keep the generic weakest-foe rule.  Out of scope (inferred/unread in the doc): the spell ladder,
# movement-style table, morale/flee, hold-back, SPACE auto/manual toggling (CCCOMBAT has no such key).
#
# Everything below is DERIVED from the rule and from an independent Python model of CCCOMBAT's
# documented LCG (state*1664525+1013904223, die(s)=state%s+1), never from CCCOMBAT output alone:
#  A. Uniform pick: 48 fixed seeds, a recruit (+300 bit 7) in reach of three foes with 5/20/40 HP.
#     BASE build: the weakest foe wins 48/48 (the retail-divergent pin).  NEW build: every foe is
#     chosen >= 8 and <= 24 times (uniform chance 16 each; binomial sd 3.27, +-2.45 sd) AND a full
#     LCG-stream replay of every trace reproduces each d20 at the index the rule predicts.
#  B. Stored-target drop: a 3-PC DQK party vs the same foes; the replay requires an enemy's final
#     victim to come from the SECOND die(m) draw (drop + re-pick), and counts how many events the
#     first draw alone would have got wrong (the null: a missing drop is visible).
#  C. CoK/DoK byte-identity: /T 0..60 plus /E CoK, DoK (/J and legacy) and no-party configs run
#     through the BASE and NEW builds must be byte-equal; a DQK-party config must DIFFER (control).
#
# -NewCom overrides the COM under test (mutation runs); -Mutant builds a patched COM first
# (gate_dok | no_dec | no_drop | first_only) and is expected to FAIL the test.
param(
  [switch]$Headless,
  [string]$NewCom = "",
  [string]$BaseRev = "df78d13e",
  [string]$Mutant = ""
)
$ErrorActionPreference = "Stop"
$root = (Split-Path -Parent $PSScriptRoot)
$native = Join-Path $root "native"
$build = Join-Path $native "build"
$run = Join-Path $build "cccombat-dqkai-test"
$dosbox = Join-Path $root "The Dark Queen of Krynn\DOSBOX\DOSBox.exe"
. (Join-Path $native "dosbox-smoke.ps1")
if (-not (Test-Path $dosbox)) { Write-Host "SKIP: retail DOSBox missing"; exit 0 }
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { Write-Host "SKIP: python missing"; exit 0 }
$nasm = "C:\Users\Caldor\AppData\Local\bin\NASM\nasm.exe"
if (-not (Test-Path $nasm)) { $g = Get-Command nasm -ErrorAction SilentlyContinue; if ($g) { $nasm = $g.Source } else { Write-Host "SKIP: NASM missing"; exit 0 } }

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null

if ($NewCom -eq "") {
  if ($Mutant -eq "") {
    & (Join-Path $native "build.ps1") -Target cccombat
    if ($LASTEXITCODE -ne 0) { throw "cccombat build failed" }
    $NewCom = Join-Path $build "cccombat.com"
  } else {
    # Mutants are assembled from a scratch copy of native/src; the shipped tree is never touched.
    $mut = Join-Path $run "mut-src"
    New-Item -ItemType Directory -Force $mut | Out-Null
    Copy-Item (Join-Path $native "src\*") $mut -Recurse -Force
    $asm = Join-Path $mut "cccombat.asm"
    $text = [IO.File]::ReadAllText($asm)
    function Patch([string]$old, [string]$new) {
      $o = $old -replace "`r?`n", "`r`n"; $n = $new -replace "`r?`n", "`r`n"
      if ($text.IndexOf($o) -lt 0 -or $text.IndexOf($o) -ne $text.LastIndexOf($o)) { throw "mutant anchor not unique: $old" }
      $script:text = $text.Replace($o, $n)
    }
    switch ($Mutant) {
      "gate_dok" { Patch "dqk_ai_gate:`n        cmp     byte [party_dok], 2`n" "dqk_ai_gate:`n        cmp     byte [party_dok], 1`n        je      .yes`n        cmp     byte [party_dok], 2`n" }
      "no_dec"   { Patch "        call    rng_die`n        dec     ax`n        mov     [rt_k], ax" "        call    rng_die`n        mov     [rt_k], ax" }
      "no_drop"  { Patch "        cmp     byte [si+C_SIDE], 0`n        jne     .resolve`n.repick:" "        cmp     byte [si+C_SIDE], 0`n        jmp     .resolve`n.repick:" }
      "first_only" { Patch "        call    rng_die`n        dec     ax`n        mov     [rt_k], ax" "        call    rng_die`n        xor     ax, ax`n        mov     [rt_k], ax" }
      default { throw "unknown mutant $Mutant" }
    }
    [IO.File]::WriteAllText($asm, $text)
    $NewCom = Join-Path $run "MUT.COM"
    & $nasm -f bin -I ($mut + "/") $asm -o $NewCom
    if ($LASTEXITCODE -ne 0) { throw "mutant assemble failed" }
  }
}
Copy-Item $NewCom (Join-Path $run "CCCOMBAT.COM") -Force

$baseDir = Join-Path $run "base-src"
New-Item -ItemType Directory -Force $baseDir | Out-Null
Push-Location $root
try {
  # Keep baseline source bytes out of a native pipeline and avoid a
  # GNU-specific tar option that Windows' default bsdtar does not support.
  $baseZip = Join-Path $baseDir 'source.zip'
  git archive --format=zip --output=$baseZip $BaseRev native/src
  if ($LASTEXITCODE -ne 0) { throw "base revision $BaseRev archive failed" }
  Expand-Archive -LiteralPath $baseZip -DestinationPath $baseDir -Force
  $baseSrc = Join-Path $baseDir "native\src"
  & $nasm -f bin -I ($baseSrc + "/") (Join-Path $baseSrc "cccombat.asm") -o (Join-Path $run "CCOLD.COM")
  if ($LASTEXITCODE -ne 0) { throw "base cccombat assemble failed" }
} finally { Pop-Location }

$py = Join-Path $run "dqkai.py"
@'
import json, re, struct, sys
from pathlib import Path

ROOT = Path(sys.argv[1]); RUN = Path(sys.argv[2]); MODE = sys.argv[3]
N_SEEDS = 48
SEEDS = [1009 + 613 * i for i in range(2 * N_SEEDS)]          # 16-bit legacy-LCG seeds, fixed a priori
JSEEDS = [0x5EED0000 + 40503 * i for i in range(N_SEEDS)]    # GBRS seeds for the /J arm
START = {'e0': (5, 4), 'e1': (5, 5), 'e2': (5, 6)}           # effect_enemy_slots, first three groups
HP0 = {'e0': 5, 'e1': 20, 'e2': 40}


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


def body(name, hp, flag, kind):
    b = bytearray(409)
    b[0] = len(name); b[1:1+len(name)] = name.encode()
    b[22] = 10
    if kind == 'cok':
        b[89] = 45; b[275] = 50; b[269] = 1; b[270] = 0; b[271] = 6; b[98] = 30; b[407] = 30
        return bytes(b)
    m = 216
    b[m:m+4] = b'GBD1'
    for off, val in ((4, 1), (6, hp), (8, 4), (10, 1), (12, 4), (14, 0), (16, 7), (20, 10), (22, 4), (26, hp)):
        struct.pack_into('<h', b, m+off, val)
    b[m+18] = 1
    b[300] = flag
    return bytes(b)


def gbpr(members, kind):
    h = bytearray(16)
    h[:4] = b'GBPR'
    if kind == 'cok':
        struct.pack_into('<HHH', h, 4, 1, len(members), 410)
    else:
        struct.pack_into('<HHHHHH', h, 4, 2, len(members), 410, 1, {'dok': 2, 'dqk': 3}[kind], 1)
    out = bytes(h)
    for i, b in enumerate(members):
        out += bytes([i+1]) + b
    return out


def gbef(groups, seed=77):
    r = bytearray(130)
    r[:4] = b'GBEF'
    struct.pack_into('<HHH', r, 4, 9, 8, 3)
    struct.pack_into('<H', r, 32, len(groups))
    for g, (mid, copies) in enumerate(groups):
        struct.pack_into('<HHH', r, 34+6*g, mid, copies, 0)
    r[116:120] = b'GBRS'
    struct.pack_into('<3HI', r, 120, 1, 34, 22, seed)
    return bytes(r)


def prepare():
    RUN.mkdir(parents=True, exist_ok=True)
    (RUN/'AI.DAX').write_bytes(dax([(1, monrec(5)), (2, monrec(20)), (3, monrec(40))]))
    (RUN/'AI.EFX').write_bytes(gbef([(1, 1), (2, 1), (3, 1)]))
    (RUN/'AI.GBP').write_bytes(gbpr([body('RECRUIT', 200, 0x80, 'dqk')], 'dqk'))
    (RUN/'MULTI.GBP').write_bytes(gbpr([body('PC%d' % i, 200, 0, 'dqk') for i in range(3)], 'dqk'))
    bat = ['@echo off']
    for i, s in enumerate(SEEDS):
        for pre, exe in (('O', 'CCOLD'), ('N', 'CCCOMBAT')):
            bat.append(f'{exe} /E AI.EFX AI.DAX {s} {pre}{i}.TRC {pre}{i}.OUT /P AI.GBP')
    for i, s in enumerate(JSEEDS):
        (RUN/f'J{i}.EFX').write_bytes(gbef([(1, 1), (2, 1), (3, 1)], s))
        for pre, exe in (('O', 'CCOLD'), ('N', 'CCCOMBAT')):
            bat.append(f'{exe} /E J{i}.EFX AI.DAX 4660 {pre}J{i}.TRC {pre}J{i}.OUT /P AI.GBP /R {pre}J{i}.GBR /J')
    for i, s in enumerate(SEEDS[:N_SEEDS]):
        for pre, exe in (('O', 'CCOLD'), ('N', 'CCCOMBAT')):
            bat.append(f'{exe} /E AI.EFX AI.DAX {s} {pre}M{i}.TRC {pre}M{i}.OUT /P MULTI.GBP')
    # CoK/DoK identity fixtures
    (RUN/'COK.GBP').write_bytes(gbpr([body('P%d' % i, 30, 0, 'cok') for i in range(3)], 'cok'))
    (RUN/'DOK.GBP').write_bytes(gbpr([body('P%d' % i, 30, 0, 'dok') for i in range(3)], 'dok'))
    (RUN/'DQK.GBP').write_bytes(gbpr([body('P%d' % i, 30, 0, 'dqk') for i in range(3)], 'dqk'))
    (RUN/'EQ.EFX').write_bytes(gbef([(2, 2), (3, 1)], 0xDEADBEEF))
    for t in range(0, 61):
        for pre, exe in (('N', 'CCCOMBAT'), ('O', 'CCOLD')):
            bat.append(f'{exe} /T {t} 4660 {pre}T{t}.TRC /R {pre}T{t}.GBR')
    for tag, party in (('COKJ', 'COK'), ('DOKJ', 'DOK'), ('DQKJ', 'DQK')):
        for pre, exe in (('N', 'CCCOMBAT'), ('O', 'CCOLD')):
            bat.append(f'{exe} /E EQ.EFX AI.DAX 4660 {pre}{tag}.TRC {pre}{tag}.OUT /P {party}.GBP /R {pre}{tag}.GBR /J')
    for tag, party in (('COKL', 'COK'), ('DOKL', 'DOK'), ('DQKL', 'DQK'), ('NOPL', '')):
        for pre, exe in (('N', 'CCCOMBAT'), ('O', 'CCOLD')):
            p = f' /P {party}.GBP' if party else ''
            bat.append(f'{exe} /E EQ.EFX AI.DAX 4660 {pre}{tag}.TRC {pre}{tag}.OUT{p}')
    (RUN/'RUN.BAT').write_text('\r\n'.join(bat) + '\r\n', encoding='ascii')


def read(p):
    return Path(p).read_bytes() if Path(p).exists() else None


def lcg_stream(seed, n=400):
    st = seed; out = []
    for _ in range(n):
        st = (st * 1664525 + 1013904223) & 0xFFFFFFFF
        out.append(st)
    return out


def cheb(a, b):
    return max(abs(a[0] - b[0]), abs(a[1] - b[1]))


def replay(path, party, stream, rule):
    """Independent model of one trace.  party = {id: (col,row)}.  Walks the trace, tracking positions,
    HP and living sets, and for every turn attack computes the in-reach hostile candidate set.
    rule 'weakest' (generic): 0 draws per pick, victim must be the lowest-HP candidate.
    rule 'random' (DQK): one die(m) draw when m>=2, plus a second die(m) when the actor is an enemy
    (stored target on side 0 is dropped); the victim must be cands[(last draw) % m].
    Every d20 must equal the stream at the predicted index.  Returns the per-pick records."""
    pos = dict(START); pos.update(party)
    hp = dict(HP0); hp.update({p: 200 for p in party})
    alive = set(START) | set(party)
    idx = len(START) + len(party)          # one initiative d10 per combatant
    recs = []; prev = None
    for ln in Path(path).read_text().splitlines():
        f = ln.split()
        if len(f) < 4: continue
        t = f[1]
        if t == 'move' and f[2] in pos and len(f) >= 12:
            pos[f[2]] = (int(f[10]), int(f[11]))
        elif t == 'attack':
            a, tg, roll, hit = f[2], f[3], int(f[4]), f[6] == '1'
            reaction = prev is not None and prev[0] == 'move' and prev[1][0] != a[0]
            if not reaction:
                foes = [x for x in sorted(alive, key=lambda s: (s[0] == 'e', s)) if x[0] != a[0]]
                cands = [x for x in foes if cheb(pos[x], pos[a]) <= 1]
                m = len(cands)
                rec = dict(actor=a, cands=cands, hp={c: hp[c] for c in cands}, target=tg, first=None, final=None)
                if rule == 'tally':
                    pass                    # candidate bookkeeping only: no draw model, no asserts
                elif rule == 'weakest':
                    lo = min(hp[c] for c in cands)
                    if sum(1 for c in cands if hp[c] == lo) == 1:
                        assert tg == [c for c in cands if hp[c] == lo][0], ('weakest rule', path, a, cands, tg)
                else:
                    if m >= 2:
                        first = cands[stream[idx] % m]; idx += 1
                        final = first
                        if a[0] == 'e':
                            final = cands[stream[idx] % m]; idx += 1
                        rec.update(first=first, final=final)
                        assert tg == final, ('victim vs LCG draw', path, a, cands, tg, final)
                    else:
                        rec.update(first=cands[0], final=cands[0])
                recs.append(rec)
            if rule != 'tally':
                assert stream[idx] % 20 + 1 == roll, ('d20 stream index', path, f, idx, stream[idx] % 20 + 1)
            idx += 1
            if hit: idx += 1               # one damage die (sides > 1) follows a hit
            if f[8] != '-': hp[tg] = int(f[8])
        elif t == 'slain':
            alive.discard(f[3])
        prev = (t, f[2])
    return recs


def first_three(recs, who):
    for r in recs:
        if r['actor'] == who and len(r['cands']) == 3:
            return r
    return None


def verify():
    # ---- A. uniform pick on the recruit fixture ----
    for label, pre, rule in (('BASE', 'O', 'weakest'), ('NEW', 'N', 'tally')):
        events = []
        for i, s in enumerate(SEEDS):
            recs = replay(RUN/f'{pre}{i}.TRC', {'p0': (3, 2)}, lcg_stream(s), rule)
            r = first_three(recs, 'p0')
            if r: events.append(r)
        assert len(events) >= N_SEEDS, (label, 'seeds with a three-foe-in-reach recruit pick', len(events))
        events = events[:N_SEEDS]
        picks = {e: sum(1 for r in events if r['target'] == e) for e in ('e0', 'e1', 'e2')}
        weakest = sum(1 for r in events if r['target'] == min(r['cands'], key=lambda c: r['hp'][c]))
        if label == 'BASE':
            assert weakest == N_SEEDS, ('BASE weakest-foe must win 48/48 (retail-divergent pin)', weakest, picks)
            base_line = 'BASE weakest wins %d/%d (picks %s)' % (weakest, N_SEEDS, picks)
        else:
            assert all(8 <= v <= 24 for v in picks.values()), ('NEW uniform band 8..24 violated', picks)
            new_line = 'NEW picks %s (band 8..24 of 48), weakest %d/%d' % (picks, weakest, N_SEEDS)
            for i, s in enumerate(SEEDS):      # strict stream replay only after the rule-level band holds
                replay(RUN/f'N{i}.TRC', {'p0': (3, 2)}, lcg_stream(s), 'random')
    # ---- A'. /J arm: Borland recurrence, GBRS seeds -- distribution only (no stream model for it) ----
    jc = {'e0': 0, 'e1': 0, 'e2': 0}; jn = 0; jw = 0
    for i in range(N_SEEDS):
        lines = (RUN/f'NJ{i}.TRC').read_text().splitlines()
        pos = dict(START); pos.update({'p0': (3, 2)}); hp = dict(HP0); alive = set(START)
        for ln in lines:
            f = ln.split()
            if len(f) < 4: continue
            if f[1] == 'move' and f[2] in pos and len(f) >= 12: pos[f[2]] = (int(f[10]), int(f[11]))
            elif f[1] == 'attack':
                if f[2] == 'p0':
                    c = [e for e in sorted(alive) if cheb(pos[e], pos['p0']) <= 1]
                    if len(c) == 3:
                        jc[f[3]] += 1; jn += 1
                        jw += f[3] == min(c, key=lambda x: hp[x])
                        break
                if f[8] != '-' and f[3] in hp: hp[f[3]] = int(f[8])
            elif f[1] == 'slain': alive.discard(f[3])
    assert jn >= 40 and all(v >= 5 for v in jc.values()) and jw < jn - 15, ('/J arm', jc, jn, jw)
    # ---- B. stored-target drop on the 3-PC fixture ----
    party = {'p0': (3, 2), 'p1': (3, 3), 'p2': (3, 4)}
    n_ev = n_enemy = n_first_wrong = 0
    for i, s in enumerate(SEEDS[:N_SEEDS]):
        recs = replay(RUN/f'NM{i}.TRC', party, lcg_stream(s), 'random')
        for r in recs:
            if r['actor'][0] == 'e' and len(r['cands']) >= 2:
                n_enemy += 1
                n_first_wrong += r['first'] != r['final']
            n_ev += len(r['cands']) >= 2
    assert n_enemy >= 40, ('too few enemy multi-candidate picks', n_enemy)
    assert n_first_wrong >= n_enemy // 4, ('null: the first draw alone must be visibly wrong', n_first_wrong, n_enemy)
    for i, s in enumerate(SEEDS[:N_SEEDS]):          # BASE multi-PC runs stay on the weakest rule and drawless
        replay(RUN/f'OM{i}.TRC', party, lcg_stream(s), 'weakest')
    print('PASS A: ' + base_line)
    print('PASS A: ' + new_line + '; all %d+%d traces replay d20-exact against the LCG stream' % (len(SEEDS), N_SEEDS))
    print('PASS A/J: Borland-recurrence arm picks %s over %d seeds (weakest-foe %d)' % (jc, jn, jw))
    print('PASS B: %d enemy multi-candidate picks re-rolled (drop on side 0); first draw alone wrong in %d (the null)' % (n_enemy, n_first_wrong))
    # ---- C. CoK/DoK identity ----
    for t in range(0, 61):
        for ext in ('TRC', 'GBR'):
            a, b = read(RUN/f'NT{t}.{ext}'), read(RUN/f'OT{t}.{ext}')
            assert a == b, ('/T identity', t, ext, None if a is None else len(a), None if b is None else len(b))
    t_bytes = sum(len(read(RUN/f'NT{t}.TRC') or b'') for t in range(0, 61))
    n_bytes = 0; shown = []
    for tag in ('COKJ', 'DOKJ', 'COKL', 'DOKL', 'NOPL'):
        for ext in ('TRC', 'OUT', 'GBR'):
            a, b = read(RUN/f'N{tag}.{ext}'), read(RUN/f'O{tag}.{ext}')
            assert a == b, ('identity', tag, ext)
            n_bytes += len(a or b'')
        assert read(RUN/f'N{tag}.TRC'), ('empty identity trace', tag)
        shown.append((tag, len(read(RUN/f'N{tag}.TRC'))))
    for tag in ('DQKJ', 'DQKL'):
        assert read(RUN/f'N{tag}.TRC') != read(RUN/f'O{tag}.TRC'), ('control: the DQK-party trace must differ', tag)
    print('PASS C: CoK/DoK identity: /T 0..60 (%d trace bytes) + 5 /E configs (%d bytes, %s) byte-equal base vs new; DQK-party control differs'
          % (t_bytes, n_bytes, shown))


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
if (-not $p.WaitForExit(1500000)) { Stop-Process -Id $p.Id -Force; throw "DOSBox timed out" }
python -I $py $root $run verify
if ($LASTEXITCODE -ne 0) { throw "CCCOMBAT DQK AI target-selection mismatch" }
Write-Host "RESULT: CCCOMBAT DQK AI target selection PASS"
