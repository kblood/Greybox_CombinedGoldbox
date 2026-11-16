"""Real-DOS proof of the GBMR v3 stage->validate->commit->resume pipeline,
plus the C-stage carve-out and candidate-smuggling rejection proof
(docs/engine/research/cok-mutation-output-ownership.md, "GBMR v3 design" and
"GBMR v3 hook-point decision").

tools/cok_native_mutation.py proves M-stage alone: with_gboc() patches an
already-built v1/v2 request directly, bypassing B-stage entirely. This module
instead drives the GENUINE v3 entry point -- a v3 GBMB manifest (built with
manifest(..., gboc=...)) fed to real CCINV B, which is
native/src/cokrequest.inc's mutation_request_body GBOC-copy branch (not
exercised by any DOS run before this module). From there: real CCINV M (the
owner-loop GBOC routing + cm_authorize_output, already proven reachable via
with_gboc() but now reached through B-stage too), real CCECL CHECK
(validate), real CCINV C (native/src/cokcommit.inc's mutation_commit_mode --
the ONE leg with no prior dynamic proof at all, this module's main point),
and real CCECL MUTATE (resume). One case exercises the full five-stage
pipeline; four sibling cases reuse its genuine request/candidate pair to
prove the C-stage carve-out is exactly as narrow as designed:

  CVALID         unmodified request + unmodified candidate -> COMMIT PASS.
  CRNGBAD        candidate's core+174 changed to a value that does NOT
                 re-derive from the request's own GBOC draws/rng_before ->
                 REJECT (the carve-out still catches a genuinely bad RNG).
  CGBOCBAD       candidate's appended GBOC block [13224,13264) has one byte
                 flipped -> REJECT (the 4th, block-identity check).
  CSMUGGLE       candidate's core+174 is the CORRECT fold (identical to
                 CVALID) but one FX-region byte at offset 300 (well inside
                 the unconditionally-checked [178,5798) span) is also
                 flipped -> REJECT. This is task 5(e) and the carve-out's
                 own doc comment: "the blanket byte-identity check that
                 forbids EVERY other field from changing is preserved
                 unconditionally on both sides of it."
  CREQBAD        the REQUEST's own core+174 is corrupted (so the request's
                 embedded GBOC.rng_before no longer matches its own paused
                 RNG) with an otherwise-untouched, valid candidate -> REJECT
                 (closes the hand-forged-request gap the .req_gboc_rng_ok:
                 check exists for).

All five names are <= 8 characters DELIBERATELY: DOS enforces 8.3 naming at
the INT 21h level for every file operation (CREATE, OPEN, and directory
lookup alike), regardless of what the underlying DOSBox-mounted host
filesystem could otherwise store. A first version of this harness used
CRNGWRONG/CGBOCTAMPER/CREQMISMATCH (9/11/12 chars) for both the per-variant
folder name and the "C:\\{name}.LOG" status file; "cd \\{name}" silently
failed to resolve the over-length folder name, left execution in whatever
directory the PREVIOUS command block ended in, and the following
"..\\CCINV C ..." line then ran against that WRONG variant's files -- read
as "CCINV hangs" from the outside (DOSBox-X's own automation timeout firing
on what was actually a fast, silent wrong-directory misfire cascading
through the rest of the batch), and confirmed as a batch-control-flow bug,
not a native-code hang, by an isolated single-case DOSBox run of the exact
CRNGBAD candidate that completed in well under a second once the name was
shortened.

Every rejection case asserts the untouched activation files (ACT.GBP,
ACT.BIN, ACT.IV) are byte-identical before and after the DOSBox run --
mc_fail's rollback contract -- so a REJECT is proven to mean "nothing was
published", not merely "the exit code was nonzero".
"""
from pathlib import Path
import hashlib
import json
import shutil
import struct
import subprocess
import zlib

from tools.cok_inventory import Inventory, encode
from tools.cok_mutation_packet import from_yield, response, manifest, seal, with_gboc, activation_seed, CORE_LEN
from tools.cok_native_removal import gboc_raw, gboc_fold
from tools.test_cok_party_removal import packets, body
from tools.test_cok_item_removal_model import item, effect

ROOT = Path(__file__).resolve().parents[1]
LEARNING = bytes(range(1, 9))
CASE = 'V0000'
# opcode 0x40 (remove item), operand [0, 39] (kind=0, target=39); matches
# every other target=39 case in tools/cok_native_yield.py's corpus.
# 22-byte header, then 0x0A,0,0 (choice=0), then 0x40,0,0x27 at PC=25
# (successor=28), then 9,0,42,1,0xEE,0x90 (successor payload), then a
# terminating 0 byte -- the exact construction add()'s default path builds.
CODE = bytes(22)+bytes([0x0A, 0, 0])+bytes([0x40, 0, 0x27])+bytes([9, 0, 42, 1, 0xEE, 0x90])+bytes([0])
PC, SUCCESSOR, TARGET = 25, 28, 39


def _seed(timers):
    """Build a well-formed 3160-byte GBPS seed whose OWNED bitmap
    (seed[282:540], 258 bytes) and raw GBPT timers blob (seed[540:3112],
    2572 bytes) are DERIVED FROM THE SAME `timers` bytes tools.
    test_cok_party_removal.packets() produced for this fixture's own
    items/effects, mirroring tools.cok_mutation_packet.request()'s own
    OWNED-from-timers derivation loop exactly (offset 12, 10 bytes/entry,
    (owner, kind) pairs) -- otherwise the seed and the real B-stage
    request's own core+8274..+11104 (which cokcommit.inc's MB_SEED check
    requires byte-identical to this seed's [282,3112) span) disagree about
    which owner has which effect applied, and cm_remove_effect's fx-list
    scan at M-stage finds nothing to authorize even though cm_gboc was
    correctly routed to the right owner. An earlier version of this
    function left [282,3112) essentially zeroed, silently producing a
    genuinely-unauthorized (empty-fx-list) removal that both real CCINV M
    and the Python reference model agreed left core+174 unfolded -- read
    as "the carve-out doesn't fire" when the real defect was this fixture
    never giving M-stage anything to authorize in the first place.
    """
    if len(timers) != 2572:
        raise ValueError('exact GBPT timers blob required')
    seed = bytearray(3160)
    struct.pack_into('<4s4H', seed, 0, b'GBPS', 6, 1, 6, 0)
    owned = bytearray(258)
    # native/src/ccecl.asm's read_seed_file, version-6 branch (.timer_owned:,
    # ~line 5423-5425): when the copied timer_count is nonzero it requires
    # word [seedbuf+PS_V3_LEN] (seed offset 282 -- this OWNED region's own
    # first word) to equal exactly 1, as a sentinel distinct from the 256-byte
    # self-consistency array that follows it at seed offset 284 (PS_V3_LEN+2).
    # An earlier version of this function left offset 282 zeroed, which is
    # otherwise harmless to CCINV B's own simpler MB_SEED check (magic/
    # version/owner_count/ages only) but makes real CCECL /D reject the seed
    # outright with "CCECL: bad or unsupported party seed sidecar" before the
    # C-stage pipeline this seed feeds ever runs.
    struct.pack_into('<H', owned, 0, 1)
    count = struct.unpack_from('<H', timers, 2)[0]
    for offset in range(12, 12+10*count, 10):
        owner, kind = timers[offset:offset+2]
        if kind:
            owned[2+32*(owner-1)+(kind >> 3)] |= 1 << (kind & 7)
    seed[282:282+258] = owned
    seed[540:540+2572] = timers
    seed[3128+39//8] = 1 << (39 % 8)
    return bytes(seed)


def prepare(directory):
    directory = Path(directory)
    nasm = shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    for name in ('ccecl', 'ccinv'):
        subprocess.run([nasm, '-f', 'bin', '-I', str(ROOT/'native/src')+'/',
                        str(ROOT/f'native/src/{name}.asm'), '-o', str(directory/f'{name}.com')], check=True)
    folder = directory/CASE
    folder.mkdir()
    (folder/'KRYNN.CFG').write_bytes(b'')
    (folder/'CODE.BIN').write_bytes(CODE)
    items = [(item(39, ready=1, ident=7),)]+[(item(39),) for _ in range(5)]
    effects = [(effect(7, 1, 0),)]+[() for _ in range(5)]
    roster, inventory, timers = packets([body()]*6, items, effects)
    (folder/'PARTY.GBP').write_bytes(roster)
    (folder/'SEED.BIN').write_bytes(_seed(timers))
    (folder/'INVENT.BIN').write_bytes(inventory)
    (folder/'ITEMS').write_bytes((ROOT/'Champions of Krynn/ITEMS').read_bytes())
    commands = ['@echo off', f'cd \\{CASE}',
                '..\\CCECL CODE.BIN /B PARTY.GBP /G SEED.BIN /D 5 /E OUT.EFX > LOG.TXT',
                'if errorlevel 1 goto YF', 'echo PASS>>C:\\YSTATUS.LOG',
                'goto YN', ':YF', 'echo FAIL>>C:\\YSTATUS.LOG', ':YN']
    (directory/'RUN.BAT').write_text('\r\n'.join(commands)+'\r\n', encoding='ascii')


def stage(directory):
    """After DOSBox pass 1 (real CCECL /D): verify the genuine yield, derive
    an authorized GBOC record from its OWN baked-in RNG state, build the v3
    manifest, and queue real CCINV B / CCINV M / CCECL CHECK."""
    directory = Path(directory)
    folder = directory/CASE
    assert (directory/'YSTATUS.LOG').read_text().split() == ['PASS']
    fx = (folder/'OUT.EFX').read_bytes()
    yld = (folder/'OUT.YLD').read_bytes()
    assert len(fx) == 5750 and fx[:4] == b'GBEF', 'malformed yield effects blob'
    assert len(yld) == 72 and yld[:8] == b'GBIY\x02\0\x48\0', 'malformed yield record'
    assert zlib.crc32(fx) == struct.unpack_from('<I', yld, 48)[0]
    assert zlib.crc32(yld[:68]) == struct.unpack_from('<I', yld, 68)[0]
    roster = (folder/'PARTY.GBP').read_bytes()
    inventory = (folder/'INVENT.BIN').read_bytes()
    seed = (folder/'SEED.BIN').read_bytes()
    table = (ROOT/'Champions of Krynn/ITEMS').read_bytes()[2:2050]
    v2_request = from_yield(yld, fx, roster, inventory, seed[540:3112], table, learning=LEARNING)
    assert len(v2_request) == CORE_LEN
    rng_before = struct.unpack_from('<I', v2_request, 174)[0]
    good_gboc = gboc_raw(callback_id=7, write_flag=1, draws=1, rng_before=rng_before,
                         rng_after=gboc_fold(rng_before, 1), target_ordinal=1, damage=10)
    want_req = with_gboc(v2_request, good_gboc)
    (folder/'WANT.REQ').write_bytes(want_req)
    (folder/'GOOD.GBOC').write_bytes(good_gboc)
    man = manifest(['INVENT.BIN', 'OUT.EFX', 'PARTY.GBP', 'SEED.BIN', 'CODE.BIN'], LEARNING, gboc=good_gboc)
    (folder/'MAN.BIN').write_bytes(man)
    commands = ['@echo off', f'cd \\{CASE}',
                '..\\CCINV B MAN.BIN REQ.BIN > BUILD.TXT',
                'if errorlevel 1 goto BF', 'echo PASS>>C:\\BSTATUS.LOG',
                'goto BN', ':BF', 'echo FAIL>>C:\\BSTATUS.LOG', ':BN',
                '..\\CCINV M INVENT.BIN REQ.BIN RES.BIN > MUT.TXT',
                'if errorlevel 1 goto MF', 'echo PASS>>C:\\MSTATUS.LOG',
                'goto MN', ':MF', 'echo FAIL>>C:\\MSTATUS.LOG', ':MN',
                '..\\CCECL CODE.BIN /B PARTY.GBP /G SEED.BIN /R RES.BIN CHECK /E CHECK.EFX /T > CHECK.TXT',
                'if errorlevel 1 goto CF', 'echo PASS>>C:\\VSTATUS.LOG',
                'goto CN', ':CF', 'echo FAIL>>C:\\VSTATUS.LOG', ':CN']
    (directory/'RUN.BAT').write_text('\r\n'.join(commands)+'\r\n', encoding='ascii')


def commit(directory):
    """After DOSBox pass 2 (real CCINV B / CCINV M / CCECL CHECK): confirm all
    three legs agree byte-exactly with the Python reference model -- this is
    the genuine v3 'stage' + 'validate' proof, reached through the real B-stage
    manifest/GBOC-copy entry point, not with_gboc()'s request-level bypass.
    Then build the five C-stage variant folders and queue real CCINV C (plus,
    for the valid case only, the real CCECL MUTATE resume leg)."""
    directory = Path(directory)
    folder = directory/CASE
    assert (directory/'BSTATUS.LOG').read_text().split() == ['PASS']
    assert (directory/'MSTATUS.LOG').read_text().split() == ['PASS']
    assert (directory/'VSTATUS.LOG').read_text().split() == ['PASS']
    req = (folder/'REQ.BIN').read_bytes()
    want_req = (folder/'WANT.REQ').read_bytes()
    assert req == want_req, 'real CCINV B (v3 GBOC-copy branch) diverged from the reference'
    inventory = (folder/'INVENT.BIN').read_bytes()
    want_res = response(req, inventory)
    res = (folder/'RES.BIN').read_bytes()
    assert res == want_res, 'real CCINV M diverged from the reference'
    good_gboc = (folder/'GOOD.GBOC').read_bytes()

    from tools.cok_mutation_packet import CORE_LEN_V3
    # res's inventory tail need not be the same length as the INPUT inventory
    # -- removing every owner's sole (targeted) item legitimately shrinks the
    # re-encoded inventory. res == want_res above already proves real CCINV M
    # reproduces the reference model exactly, length included.
    assert len(req) == CORE_LEN_V3 and len(res) >= CORE_LEN_V3

    def make(name, req_bytes, res_bytes):
        d = directory/name
        d.mkdir()
        shutil.copyfile(folder/'CODE.BIN', d/'CODE.BIN')
        # sniff_dialect (native/src/ccecl.asm) sets [is_cok] by probing for
        # KRYNN.CFG (Gen1 CoK) vs DKK.CFG in CCECL's CURRENT directory, and
        # cokresume.inc's ir_read requires [is_cok]==1 as its very first
        # check on any /R candidate. Without a per-variant copy, the CVALID
        # subfolder's own real CCECL MUTATE resume leg finds is_cok==0 and
        # rejects immediately with "bad or unsupported resume state" before
        # looking at the candidate at all -- diagnosed by a temporary debug
        # tag dumped from ir_read/ir_apply/ir_active, isolating the failure
        # to ir_read's opening `cmp byte [is_cok],1` rather than any of the
        # ~50 structural/GBOC-adjacent checks that follow it.
        shutil.copyfile(folder/'KRYNN.CFG', d/'KRYNN.CFG')
        shutil.copyfile(folder/'OUT.EFX', d/'OUT.EFX')
        shutil.copyfile(folder/'PARTY.GBP', d/'ACT.GBP')
        shutil.copyfile(folder/'SEED.BIN', d/'ACT.BIN')
        shutil.copyfile(folder/'INVENT.BIN', d/'ACT.IV')
        # mb_items_path (native/src/cokrequest.inc) derives the ITEMS lookup
        # path from the manifest's own code-path entry's directory component
        # -- 'CODE.BIN' here carries none, so it looks for ITEMS in CCINV's
        # CURRENT directory (this variant's own subfolder), not the shared
        # V0000 fixture folder. Every variant needs its own copy.
        shutil.copyfile(folder/'ITEMS', d/'ITEMS')
        (d/'REQ.BIN').write_bytes(req_bytes)
        (d/'RES.BIN').write_bytes(res_bytes)
        (d/'CMAN.BIN').write_bytes(manifest(['ACT.IV', 'OUT.EFX', 'ACT.GBP', 'ACT.BIN', 'CODE.BIN'], LEARNING))
        return d

    make('CVALID', req, res)

    bad_rng = bytearray(res)
    real_rng = struct.unpack_from('<I', res, 174)[0]
    struct.pack_into('<I', bad_rng, 174, (real_rng ^ 0x2A2A2A2A) & 0xFFFFFFFF)
    make('CRNGBAD', req, bytes(seal(bad_rng)))

    tampered_block = bytearray(res)
    tampered_block[13224+26] ^= 0xFF  # GBOC damage byte
    # Recompute the GBOC record's OWN self-CRC (bytes 0..35 of the 40-byte
    # block) so the tamper looks like a well-formed, internally-consistent
    # alternate GBOC record -- otherwise mr_request.validate's .matrix:
    # structural self-CRC check (re-run against the candidate at C-stage)
    # would reject it before the 4th, block-identity check this case targets
    # ever runs.
    struct.pack_into('<I', tampered_block, 13224+36, zlib.crc32(bytes(tampered_block[13224:13224+36])))
    make('CGBOCBAD', req, bytes(seal(tampered_block)))

    smuggled = bytearray(res)
    smuggled[300] ^= 0xFF  # FX-region byte, well inside the unconditional [178,5798) span
    make('CSMUGGLE', req, bytes(seal(smuggled)))

    bad_req = bytearray(req)
    struct.pack_into('<I', bad_req, 174, (struct.unpack_from('<I', req, 174)[0] ^ 0x55) & 0xFFFFFFFF)
    make('CREQBAD', bytes(seal(bad_req)), res)

    # Every name here is <= 8 characters -- see the module docstring for why
    # that is load-bearing, not cosmetic (DOS 8.3 truncation misroutes both
    # `cd \{name}` and `C:\{name}.LOG` for anything longer).
    variants = ['CVALID', 'CRNGBAD', 'CGBOCBAD', 'CSMUGGLE', 'CREQBAD']
    snapshots = {name: {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                        for p in (directory/name).iterdir() if p.is_file()}
                for name in variants}
    (directory/'commit-inputs.json').write_text(json.dumps(snapshots), encoding='utf-8')

    # DOS batch labels are also truncated to ~8 significant characters, so
    # use short numeric label suffixes (matching every other harness in this
    # repo, e.g. cok_native_yield.py's `:F{index}`) rather than descriptive
    # per-variant labels, even though the variant names above are now
    # themselves short enough not to need this for directory/file lookups.
    commands = ['@echo off']
    for index, name in enumerate(variants):
        commands += [f'cd \\{name}',
                     '..\\CCINV C CMAN.BIN REQ.BIN RES.BIN > COMMIT.TXT',
                     f'if errorlevel 1 goto F{index}', f'echo PASS>>C:\\{name}.LOG',
                     f'goto N{index}', f':F{index}', f'echo FAIL>>C:\\{name}.LOG', f':N{index}']
    commands += [f'cd \\CVALID',
                 'copy RES.BIN RUN.BIN > NUL',
                 '..\\CCECL CODE.BIN /B ACT.GBP /G ACT.BIN /R RUN.BIN MUTATE /E NEXT.EFX > NEXT.TXT',
                 'if errorlevel 1 goto RF', 'echo PASS>>C:\\RESUME.LOG',
                 'goto RN', ':RF', 'echo FAIL>>C:\\RESUME.LOG', ':RN']
    (directory/'RUN.BAT').write_text('\r\n'.join(commands)+'\r\n', encoding='ascii')

    length = struct.unpack_from('<H', res, 20)[0]
    wanted = {'ACT.GBP': res[5798:5798+length].hex(),
             'ACT.IV': res[13264:].hex(),
             'ACT.BIN': activation_seed((folder/'SEED.BIN').read_bytes(), res).hex()}
    (directory/'commit-wanted.json').write_text(json.dumps(wanted), encoding='utf-8')


def finish(directory):
    """After DOSBox pass 3 (real CCINV C x5, real CCECL MUTATE for the valid
    case): CVALID must commit and publish exactly the candidate's own
    post-mutation state into ACT.GBP/ACT.BIN/ACT.IV; the other four must be
    rejected with every one of their input files provably untouched
    (mc_fail's rollback), and CCECL MUTATE must resume cleanly from the
    published state."""
    directory = Path(directory)
    snapshots = json.loads((directory/'commit-inputs.json').read_text(encoding='utf-8'))
    wanted = json.loads((directory/'commit-wanted.json').read_text(encoding='utf-8'))
    for name in ('CRNGBAD', 'CGBOCBAD', 'CSMUGGLE', 'CREQBAD'):
        assert (directory/f'{name}.LOG').read_text().split() == ['FAIL'], name
        folder = directory/name
        for filename, digest in snapshots[name].items():
            assert hashlib.sha256((folder/filename).read_bytes()).hexdigest() == digest, (name, filename, 'file changed despite rejection')
        assert not list(folder.glob('*.MS?')) and not list(folder.glob('*.MB?')), (name, 'stage/backup left behind on rejection')
    assert (directory/'CVALID.LOG').read_text().split() == ['PASS']
    folder = directory/'CVALID'
    for filename, expected in wanted.items():
        assert (folder/filename).read_bytes() == bytes.fromhex(expected), (filename, 'not published on commit')
    assert not list(folder.glob('*.MS?')) and not list(folder.glob('*.MB?')), 'stage/backup left behind after commit'
    assert (directory/'RESUME.LOG').read_text().split() == ['PASS']
    fx = (folder/'NEXT.EFX').read_bytes()
    assert struct.unpack_from('<H', fx, 8)[0] == 0, 'resumed VM did not complete cleanly'
    count = struct.unpack_from('<H', fx, 196)[0]
    keys = struct.unpack_from(f'<{count}H', fx, 198)
    vals = struct.unpack_from(f'<{count}H', fx, 1222)
    memory = dict(zip(keys, vals))
    assert memory[0x90EE] == 42, 'resumed VM did not execute past the removal opcode'
    print('PASS: 1 DOS v3 stage/validate/commit/resume pipeline, 4 DOS C-stage carve-out rejections')


if __name__ == '__main__':
    import sys
    {'prepare': prepare, 'stage': stage, 'commit': commit, 'finish': finish}[sys.argv[1]](sys.argv[2])
