"""Real DOS fixtures for CCINV's combined mutation request/response."""
from pathlib import Path
import hashlib
import itertools
import json
import shutil
import struct
import subprocess
import zlib

from tools.cok_mutation_packet import (request, with_target, response, seal, with_gboc,
                                        CORE_LEN, FX, FRAME, TIMERS, TABLE, TYPES)
from tools.cok_inventory import Inventory, decode, encode
from tools.cok_native_removal import gboc_raw, gboc_fold
from tools.test_cok_party_removal import packets, body
from tools.test_cok_item_removal_model import item, effect

ROOT = Path(__file__).resolve().parents[1]


def fixture(items, effects, *, reverse=False, selected=False, target=39):
    roster, inventory, timers = packets([body()]*len(items), items, effects, reverse)
    fx = bytearray(5750)
    fx[:4] = b'GBEF'
    struct.pack_into('<H', fx, 4, 9)
    struct.pack_into('<H', fx, 8, 4)
    fx[116:120] = b'GBRS'
    struct.pack_into('<HHI', fx, 122, 7, 33, 0xDEADBEEF)
    # Preserve nonempty continuation and queued effects, without interpreting them.
    struct.pack_into('<HH', fx, 130, 1, 22)
    struct.pack_into('<HH', fx, 196, 1, 0x1234)
    struct.pack_into('<H', fx, 1222, 0x5678)
    fx[2246:2250] = b'GBSX'
    struct.pack_into('<HHH', fx, 2250, 1, 0x2e, 7)
    fx[5708:5712] = b'GBES'
    fx[5720:5724] = b'GBHD'
    struct.pack_into('<4H', fx, 5724, 6, 33, 0x40, 7)
    fx[5732:5736] = b'GBCL'
    struct.pack_into('<7H', fx, 5736, 9, 8, 5, 23, 29, 11, 123)
    table = (ROOT/'Champions of Krynn/ITEMS').read_bytes()[2:2050]
    raw = request(roster, inventory, timers, table, fx, successor=36, block_length=80,
                  comparisons=(0x8000, 1234), flags=bytes([1, 0, 0, 0, 0, 0]),
                  selected=len(items) if selected else 0, selected_valid=selected,
                  learning=bytes([1, 2, 3, 4, 5, 6, 7, 8]))
    return with_target(raw, target), inventory


def prepare(directory):
    directory = Path(directory)
    cases = []
    for count, reverse in itertools.product(range(7), (False, True)):
        items = [(item(39, 9, ready=1, cursed=i % 2), item(6, marker=121, ready=1),
                  item(1), item(39)) for i in range(count)]
        effects = [(effect(), effect(23, 0), effect(14, 0)) for _ in items]
        cases.append((*fixture(items, effects, reverse=reverse, selected=bool(count)), 'ok'))
    records = (item(39, 9, ready=1), item(6, marker=121, ready=1), item(1), item(39))
    for order in itertools.permutations(records):
        cases.append((*fixture([order], [(effect(), effect(23, 0))]), 'ok'))
    for target in (0, 39, 255):
        cases.append((*fixture([(item(39),)*1101], [()], target=target), 'ok'))
    for kind, flags in itertools.product((12, 14, 38), (0, 101, 255)):
        cases.append((*fixture([(item(39, ready=1, ident=kind), item(59, 5, ready=1, ident=6))],
                               [(effect(kind, 1, flags), effect(kind, 1, 125))]), 'ok'))
    for count in range(1, 7):
        packet, inv = fixture([(item(39), item(1))]*count, [()]*count, selected=True)
        raw = bytearray(packet)
        rows = decode(inv)
        inv = encode(Inventory(128+i, row.present, row.cloud, row.records)
                     for i, row in enumerate(rows))
        for i in range(count):
            raw[5814+410*i] = 128+i
        raw[TIMERS+4:TIMERS+12] = bytes(8)
        struct.pack_into('<II', raw, FRAME+24, zlib.crc32(inv), len(inv))
        cases.append((seal(raw), inv, 'ok'))
    cases.append((*fixture([(item(6, 9, ready=1, marker=121),)], [(effect(),)], target=6), 'reject'))
    # Task 2 (docs/engine/HANDOFF-NATIVE-DOS-2026-09-08.md, "staged callback
    # outputs for the verified subset"): effect kind 7 is the Class B example
    # from cok-mutation-packet.md's "Versioned callback output ownership"
    # section -- it must keep rejecting through real CCINV.COM until RNG/damage
    # output ownership is implemented, not merely by construction. cm_kind=7 is
    # only rejected in cokremove.inc's cm_remove_effect when the matching
    # effect record's own applied byte is nonzero (item action 0 dispatches to
    # cm_remove_effect using the item's ident byte as cm_kind); an unapplied
    # id-7 record is unlinked without complaint, same as any other unsupported
    # id, so both branches are exercised here.
    cases.append((*fixture([(item(39, ready=1, ident=7),)], [(effect(7, 1, 0),)]), 'reject'))
    cases.append((*fixture([(item(39, ready=1, ident=7),)], [(effect(7, 0, 0),)]), 'ok'))
    for owner in range(6):
        items = [(item(39),) for _ in range(6)]
        effects = [() for _ in range(6)]
        items[owner] = (item(39, ready=1, ident=35),)
        effects[owner] = (effect(35),)
        cases.append((*fixture(items, effects), 'reject'))
    # These v1/v2 controls retain the pre-v3 rejection contract: an applied
    # kind-7 effect without an appended GBOC record rejects the whole stage.
    # They cover per-owner routing, a kind-7 rejection beside an unrelated
    # successful effect, and same-owner ordering. The v3 cases below prove the
    # distinct authorized path through this same real CCINV M pipeline.
    for owner in range(6):
        items = [(item(39),) for _ in range(6)]
        effects = [() for _ in range(6)]
        items[owner] = (item(39, ready=1, ident=7),)
        effects[owner] = (effect(7, 1, 0),)
        cases.append((*fixture(items, effects), 'reject'))
    for owner_a, owner_b in ((0, 1), (2, 5), (5, 0)):
        items = [(item(39),) for _ in range(6)]
        effects = [() for _ in range(6)]
        items[owner_a] = (item(39, ready=1, ident=12),)
        effects[owner_a] = (effect(12, 1, 0),)
        items[owner_b] = (item(39, ready=1, ident=7),)
        effects[owner_b] = (effect(7, 1, 0),)
        cases.append((*fixture(items, effects), 'reject'))
    for first, second in ((12, 7), (7, 12)):
        items = [(item(39, ready=1, ident=first), item(39, ready=1, ident=second))]
        items += [(item(39),) for _ in range(5)]
        effects = [(effect(first, 1, 0), effect(second, 1, 0))]
        effects += [() for _ in range(5)]
        cases.append((*fixture(items, effects), 'reject'))
    # GBMR v3 dynamic proof (2026-09-09, GBOC v1 output authorization,
    # docs/engine/research/cok-mutation-output-ownership.md "GBMR v3
    # design"). Every case below feeds a REAL v3 request (built with
    # with_gboc()) straight to real CCINV M, exactly like every v1/v2 case
    # in this suite -- no bypass. Single-owner scope: the owner loop
    # (native/src/cokmutation.inc's .gboc:/.invoke:) only ever wires
    # cm_gboc for the owner whose one-based ordinal matches the record's own
    # target_ordinal, and cm_authorize_output itself requires
    # target_ordinal==1, so only the FIRST party member (owner index 0) can
    # ever receive an authorized GBOC output under this round's wiring.
    def with_v2_context(packet):
        # mr_request.validate's context-block check treats core+32.. as
        # RESERVED-must-be-zero only for version==1 (.reserved: branch); v2
        # and v3 alike require it to hold a genuine step/chain/repeat/
        # damage-watermark context (core+32 in particular must be a nonzero
        # step count, >=1). fixture()'s request() never populates this
        # region (it stays all-zero, valid only for version 1), so bumping
        # a fixture()-built packet straight to version 3 via with_gboc()
        # alone fails this check for an unrelated reason before cm_gboc is
        # ever consulted. Patch a minimal valid context (step=1; chain,
        # repeat and the damage watermark all legally zero) so every case
        # below fails (or succeeds) for the GBOC-specific reason it targets,
        # not for this structural v1-vs-v2+ mismatch.
        patched = bytearray(packet)
        struct.pack_into('<H', patched, 32, 1)
        return bytes(seal(patched))

    v3_owner_items = [(item(39, ready=1, ident=7),)] + [(item(39),) for _ in range(5)]
    v3_owner_effects = [(effect(7, 1, 0),)] + [() for _ in range(5)]
    v3_packet, v3_inv = fixture(v3_owner_items, v3_owner_effects)
    v3_packet = with_v2_context(v3_packet)
    v3_rng_before = struct.unpack_from('<I', v3_packet, 174)[0]
    # (c) valid, authorized GBOC succeeds with the RNG folded forward.
    # Damage variants sweep the retail HP-clamp/status-transition arithmetic
    # cm_authorize_output's prior-status==0 branch is proven correct for
    # (tools.test_cok_effect7_damage_consumer's retail-ground-truth axis):
    # 0 (no-op write), partial, exact-kill (status 4), overkill<=9 (status
    # 5), overkill>9 (status 6). CHRDATA1.SAV owner 0's HP is 27.
    for draws, damage in ((1, 0), (1, 10), (3, 27), (2, 30), (5, 45)):
        gboc = gboc_raw(callback_id=7, write_flag=1, draws=draws, rng_before=v3_rng_before,
                        rng_after=gboc_fold(v3_rng_before, draws), target_ordinal=1, damage=damage)
        cases.append((with_gboc(v3_packet, gboc), v3_inv, 'ok'))
    # (d) invalid/unauthorized GBOC is rejected outright -- no candidate is
    # ever written (mr_fail unwinds every staged/created file), so "the RNG
    # is unchanged" holds trivially: there is no output core to have changed
    # it in. Covers both mr_request.validate's structural .matrix: check
    # (magic/version/length/self-CRC) and cm_authorize_output's own semantic
    # checks (reserved-zero, rng-before match, callback id, target ordinal,
    # prior status -- the 2026-09-09 adversarial-review guard).
    good_gboc = gboc_raw(callback_id=7, write_flag=1, draws=1, rng_before=v3_rng_before,
                         rng_after=gboc_fold(v3_rng_before, 1), target_ordinal=1, damage=10)
    bad_magic = gboc_raw(callback_id=7, write_flag=1, draws=1, rng_before=v3_rng_before,
                         rng_after=gboc_fold(v3_rng_before, 1), target_ordinal=1, damage=10,
                         magic=b'GBOX')
    bad_crc = bytearray(good_gboc)
    bad_crc[36] ^= 1
    wrong_callback = gboc_raw(callback_id=8, write_flag=1, draws=1, rng_before=v3_rng_before,
                              rng_after=gboc_fold(v3_rng_before, 1), target_ordinal=1, damage=10)
    wrong_rng_before = gboc_raw(callback_id=7, write_flag=1, draws=1, rng_before=v3_rng_before ^ 1,
                                rng_after=gboc_fold(v3_rng_before ^ 1, 1), target_ordinal=1, damage=10)
    wrong_target_ordinal = gboc_raw(callback_id=7, write_flag=1, draws=1, rng_before=v3_rng_before,
                                    rng_after=gboc_fold(v3_rng_before, 1), target_ordinal=2, damage=10)
    unfolded_rng_after = gboc_raw(callback_id=7, write_flag=1, draws=1, rng_before=v3_rng_before,
                                  rng_after=v3_rng_before, target_ordinal=1, damage=10)
    reserved_nonzero = gboc_raw(callback_id=7, write_flag=1, draws=1, rng_before=v3_rng_before,
                                rng_after=gboc_fold(v3_rng_before, 1), target_ordinal=1, damage=10,
                                reserved11=1)
    for gboc in (bytes(bad_magic), bytes(bad_crc), wrong_callback, wrong_rng_before,
                wrong_target_ordinal, unfolded_rng_after, reserved_nonzero):
        cases.append((with_gboc(v3_packet, gboc), v3_inv, 'reject'))
    # wrong_target_ordinal above never even reaches cm_authorize_output's own
    # target_ordinal check: the owner loop routes cm_gboc by that same field,
    # so target_ordinal=2 routes it to owner 1 (who has no applied kind-7
    # effect at all here) while owner 0 -- who DOES -- gets cm_gboc left at
    # 0 and rejects the old v1/v2 way (unmodeled applied callback). To
    # exercise cm_authorize_output's OWN "single-owner scope: target_ordinal
    # must be exactly 1" check precisely, give owner 1 the SAME ready+applied
    # kind-7 setup and route a target_ordinal=2 record there: the owner loop
    # now correctly wires cm_gboc for owner 1 (whose one-based ordinal IS
    # 2), so cm_authorize_output is genuinely invoked and must reject solely
    # because its own hardcoded requirement is target_ordinal==1.
    owner1_items = [(item(39),), (item(39, ready=1, ident=7),)] + [(item(39),) for _ in range(4)]
    owner1_effects = [(), (effect(7, 1, 0),)] + [() for _ in range(4)]
    owner1_packet, owner1_inv = fixture(owner1_items, owner1_effects)
    owner1_packet = with_v2_context(owner1_packet)
    owner1_rng_before = struct.unpack_from('<I', owner1_packet, 174)[0]
    owner1_gboc = gboc_raw(callback_id=7, write_flag=1, draws=1, rng_before=owner1_rng_before,
                           rng_after=gboc_fold(owner1_rng_before, 1), target_ordinal=2, damage=10)
    cases.append((with_gboc(owner1_packet, owner1_gboc), owner1_inv, 'reject'))
    # The 2026-09-09 adversarial-review guard specifically: a well-formed,
    # self-consistent, correctly-targeted GBOC record is still rejected when
    # the target's OWN prior status is nonzero, because cm_authorize_output's
    # arithmetic is only proven correct for status 0 (see
    # tools.test_cok_effect7_damage_consumer's prior-status-axis tests
    # against the real retail binary, and cokremove.inc's own guard). Owner
    # 0's CHRDATA1.SAV status byte is mutated in the roster directly, since
    # gboc_raw() has no field for it.
    for prior_status in (1, 2, 4, 6):
        mutated_packet = bytearray(v3_packet)
        mutated_packet[5798+16+1+392] = prior_status
        mutated_packet = bytes(seal(mutated_packet))
        cases.append((with_gboc(mutated_packet, good_gboc), v3_inv, 'reject'))
    # (e) a valid-looking (self-consistent, correctly-targeted, correctly-
    # folding) GBOC record cannot be used to smuggle a change to any OTHER
    # field through mutation_mode itself: mutation_mode only ever writes
    # exactly what cm_destroy/cm_authorize_output produce, so this half of
    # (e) is necessarily proven by every 'ok' case above producing exactly
    # response()'s byte-exact prediction (which models the SAME narrow
    # write cm_authorize_output performs: core+174 and one owner's own
    # HP/status/active bytes, nothing else). The candidate-smuggling
    # rejection this describes is cokcommit.inc's carve-out, at C-stage, not
    # M-stage -- proven separately in tools.cok_native_commit_v3 against
    # real CCINV C.
    base, inventory = fixture([(item(39), item(1))], [(effect(14, 0),)])
    # Re-seal invalid packets: semantic checks must reject independently of CRC.
    corruptions = [(0, 0), (4, 2), (6, 2), (8, 1), (10, 8), (12, 32),
                   (14, 33), (15, 1), (17, 1), (18, 1), (20, 0), (22, 0),
                   (24, 0), (26, 1), (32, 1), (5810, 1), (6224, 1),
                   (FRAME, 0), (FRAME+4, 2), (FRAME+6, 0), (FRAME+12, 2),
                   (FRAME+18, 1), (FRAME+20, 1), (FRAME+23, 65), (FRAME+24, 0),
                   (FRAME+28, 0), (FX+4, 8), (FX+8, 3), (FX+116, 0),
                   (FX+120, 1), (FX+122, 8), (FX+124, 32), (FX+130, 33),
                   (FX+197, 3), (FX+2246, 0), (FX+2250, 65), (FX+32, 9),
                   (FX+82, 9), (FX+5708, 0), (FX+5720, 0), (FX+5724, 5),
                   (FX+5726, 32), (FX+5728, 0), (FX+5730, 8), (FX+5732, 0),
                   (8274, 0), (8277, 0), (TIMERS, 0), (TIMERS+3, 2),
                   (TIMERS+4, 3), (TIMERS+5, 1), (TIMERS+12, 0), (TYPES, 0)]
    for offset, value in corruptions:
        bad = bytearray(base)
        assert bad[offset] != value, (offset, value)
        bad[offset] = value
        cases.append((seal(bad), inventory, 'reject'))
    bad = bytearray(base)
    bad[28] ^= 1
    cases.extend([(bytes(bad), inventory, 'reject'), (base[:-1], inventory, 'reject'),
                  (base+b'X', inventory, 'reject'), (base, inventory[:-1], 'reject')])
    bad_inventory = bytearray(inventory)
    bad_inventory[-1] ^= 1
    cases.append((base, bytes(bad_inventory), 'reject'))
    for collision in ('response', 'temp', 'work', 'alias', 'temp_alias', 'work_alias'):
        cases.append((base, inventory, collision))
    cases.append((base, inventory, 'ok'))
    manifest, commands = [], ['@echo off']
    for index, (packet, inv, verdict) in enumerate(cases):
        stem = f'C{index:04}'
        expected = response(packet, inv) if verdict == 'ok' else None
        (directory/f'{stem}.REQ').write_bytes(packet)
        (directory/f'{stem}.INV').write_bytes(inv)
        if expected is not None:
            (directory/f'{stem}.EXP').write_bytes(expected)
        collision = {'response': 'RES', 'temp': 'NEW', 'work': 'IWK'}.get(verdict)
        if collision:
            (directory/f'{stem}.{collision}').write_bytes(b'PREEXISTING')
        suffix = {'alias': 'REQ', 'temp_alias': 'new', 'work_alias': 'iwk'}.get(verdict, 'RES')
        out = f'{stem}.{suffix}'
        commands.extend([f'CCINV M {stem}.INV {stem}.REQ {out} > {stem}.LOG',
                         f'if errorlevel 1 goto F{index}',
                         f'echo PASS>>STATUS.LOG', f'goto N{index}', f':F{index}',
                         'echo FAIL>>STATUS.LOG', f':N{index}'])
        manifest.append({'stem': stem, 'verdict': verdict,
                         'request': hashlib.sha256(packet).hexdigest(),
                         'inventory': hashlib.sha256(inv).hexdigest()})
    (directory/'RUN.BAT').write_text('\r\n'.join(commands)+'\r\n', encoding='ascii')
    (directory/'expected.json').write_text(json.dumps(manifest), encoding='utf-8')
    nasm = shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    subprocess.run([nasm, '-f', 'bin', '-I', str(ROOT/'native/src')+'/',
                    str(ROOT/'native/src/ccinv.asm'), '-o', str(directory/'CCINV.COM')], check=True)


def verify(directory):
    directory = Path(directory)
    manifest = json.loads((directory/'expected.json').read_text(encoding='utf-8'))
    statuses = (directory/'STATUS.LOG').read_text().split()
    assert len(statuses) == len(manifest), (len(statuses), len(manifest))
    for case, status in zip(manifest, statuses):
        stem, verdict = case['stem'], case['verdict']
        assert status == ('PASS' if verdict == 'ok' else 'FAIL'), (stem, verdict, status)
        for suffix, key in (('REQ', 'request'), ('INV', 'inventory')):
            assert hashlib.sha256((directory/f'{stem}.{suffix}').read_bytes()).hexdigest() == case[key], stem
        for suffix, collision in (('NEW', 'temp'), ('IWK', 'work')):
            path = directory/f'{stem}.{suffix}'
            if verdict == collision:
                assert path.read_bytes() == b'PREEXISTING', stem
            else:
                assert not path.exists(), (stem, suffix, 'leftover')
        output = directory/f'{stem}.RES'
        if verdict == 'ok':
            expected = (directory/f'{stem}.EXP').read_bytes()
            actual = output.read_bytes()
            assert actual == expected, (stem, len(actual), len(expected),
                                        next((i for i, (a, b) in enumerate(zip(actual, expected)) if a != b), None))
        elif verdict == 'response':
            assert output.read_bytes() == b'PREEXISTING', stem
        else:
            assert not output.exists(), stem
    print(f'PASS: {len(manifest)} DOS combined mutation cases')


if __name__ == '__main__':
    import sys
    {'prepare': prepare, 'verify': verify}[sys.argv[1]](sys.argv[2])
