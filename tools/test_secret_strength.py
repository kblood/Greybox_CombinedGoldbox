"""Differential original DOS 1Dh execution and explicit legacy-native RED."""
from pathlib import Path
from io import BytesIO
import random
import shutil
import struct
import subprocess
import zipfile

import pytest
pytest.importorskip('unicorn')
from tools.secret_melee_oracle import DEFAULT_ROOT, load, DATA_BASE
from tools.secret_strength import actor_strength, level_predicate, party_strength, normal_player_body
from tools.secret_player_stats import player_stats
from tools.secret_strength_oracle import StrengthOracle, PARSER_GLOBALS
from tools.secret_player_oracle import PlayerMachine
from tools.test_secret_player_stats import inputs
from tools.test_secret_continuation_write import Machine as NativeMachine
from tools.test_secret_continuation_io import x86


def body():
    result = bytearray(439)
    for offset, value in ((437,25),(427,61),(426,40),(285,2),(278,3),
                          (280,2),(273,4),(107,6),(239,0)):
        result[offset] = value
    return bytes(result)


@pytest.fixture(scope='module')
def oracle():
    if not (DEFAULT_ROOT/'GAME.OVR').is_file():
        pytest.skip('never-vendored original Secret source absent')
    return StrengthOracle(load())


def compare(oracle, bodies):
    result = oracle.run(tuple(bodies))
    assert result.value == party_strength(bodies)
    assert result.pc == 0x8004
    assert result.global_writes <= PARSER_GLOBALS
    assert result.global_changes <= PARSER_GLOBALS
    assert result.area_writes == ((0x20, 2, result.value),)
    assert oracle.machine.location(0x9073) in result.visited
    assert oracle.machine.location(0x9727) in result.visited
    assert oracle.machine.location(0x9f3a) in result.visited
    return result


@pytest.mark.parametrize('count', range(9))
def test_complete_original_parser_destination_and_readonly_actor_list(oracle, count):
    result = compare(oracle, [body()]*count)
    assert result.value == 9*count


@pytest.mark.parametrize('offset', [437,427,426,285,278,280,273,107,239,279])
@pytest.mark.parametrize('value', [0,1,39,40,60,61,127,128,255])
def test_raw_byte_signedness_thresholds_and_intermediate_wrapping(oracle, offset, value):
    changed = bytearray(body())
    changed[offset] = value
    compare(oracle, [bytes(changed)])


def test_helper_all_gates_signed_comparators_and_seventh_byte_fallback(oracle):
    for gate in range(256):
        changed = bytearray(body()); changed[107] = gate
        assert oracle.predicate(bytes(changed)) == level_predicate(changed)
    for winner in range(7):
        for level in (0,1,127,128,255):
            for threshold in (0,1,127,128,255):
                changed = bytearray(body()); changed[273:280] = bytes(7)
                changed[273+winner], changed[239] = level, threshold
                assert oracle.predicate(bytes(changed)) == level_predicate(changed)


def test_raw_random_records_and_party_accumulator_wrap(oracle):
    generator = random.Random(0x1d243)
    for _ in range(100):
        bodies = [generator.randbytes(439) for _ in range(generator.randrange(1,9))]
        compare(oracle, bodies)
    extreme = bytearray([255]*439)
    compare(oracle, [bytes(extreme)]*8)
    assert party_strength([body()]*32) == (9*32)&255
    compare(oracle, [body()]*32)


def test_declared_hp_mutation_changes_original_metric(oracle):
    before = body()
    after = bytearray(before); after[437] = 0
    assert compare(oracle, [before]).value == 9
    assert compare(oracle, [bytes(after)]).value == 7


def test_unrelated_poison_and_archived_links_do_not_change_metric(oracle):
    changed = bytearray(body())
    read_fields = {107,239,273,274,275,276,277,278,279,280,285,426,427,437}
    for index in range(439):
        if index not in read_fields: changed[index] = 0xa5
    assert compare(oracle, [bytes(changed)]).value == 9
    assert party_strength([bytes(changed)]) == actor_strength(body())
    poisoned = StrengthOracle(load(), poison=True)
    assert compare(poisoned, [bytes(changed)]).value == 9


@pytest.mark.parametrize('destination', [0x4b10,0x4b20,0x4eff])
def test_original_store_resolves_the_declared_destination(oracle, destination):
    result = oracle.run((body(),), destination=destination)
    assert result.value == 9
    assert result.area_writes == (((destination-0x4b00)*2,2,9),)
    assert result.global_writes <= PARSER_GLOBALS


@pytest.mark.parametrize('destination,extra', [(0x4bfd,{0xa4ce}), (0x4bfe,{0xa4ce}),
                                               (0x4be6,{0x67e7,0x67e8})])
def test_original_special_destination_side_effects_are_explicit(oracle, destination, extra):
    result = oracle.run((body(),), destination=destination)
    assert result.value == 9
    assert result.global_writes == PARSER_GLOBALS | extra
    assert result.global_changes <= PARSER_GLOBALS | extra


def test_unchanged_special_coordinate_destination_does_not_mark_view(oracle):
    result = oracle.run((body(),), destination=0x4be6, previous=9)
    assert result.value == 9
    assert result.global_writes == PARSER_GLOBALS
    assert result.global_changes <= PARSER_GLOBALS


def test_actual_six_player_loader_bodies_and_settled_hp(inputs, oracle):
    retail, held = inputs
    bodies = [PlayerMachine(retail, held).load_player(f'CHRDATA{i}.SAV').body
              for i in range(1,7)]
    compare(oracle, bodies)
    # Change only the original current-HP byte in an otherwise exact body;
    # this does not invent a party membership or a saved-game restoration.
    damaged = [bytearray(b) for b in bodies]
    for row in damaged: row[437] = max(0, row[437]-10)
    compare(oracle, [bytes(row) for row in damaged])
    assert party_strength(bodies) != party_strength(damaged)


def test_normal_portable_player_cache_matches_original_six_hero_metric(inputs, oracle):
    retail, held = inputs
    actual = [PlayerMachine(retail,held).load_player(f'CHRDATA{i}.SAV').body
              for i in range(1,7)]
    projected = [normal_player_body(player_stats(held[f'CHRDATA{i}.SAV'], (),retail.definitions))
                 for i in range(1,7)]
    assert [actor_strength(b) for b in actual] == [actor_strength(b) for b in projected]
    assert compare(oracle, actual).value == compare(oracle, projected).value


def test_invalid_actor_extents_and_oracle_arena_fail_before_execution(oracle):
    for invalid in (b'', bytes(438), bytes(440)):
        with pytest.raises(ValueError): actor_strength(invalid)
        with pytest.raises(ValueError): oracle.run((invalid,))
    with pytest.raises(ValueError): oracle.run((body(),)*33)
    with pytest.raises(ValueError): oracle.run((body(),), destination=0x0120)


@pytest.fixture(scope='module')
def legacy_native(tmp_path_factory):
    root = Path(__file__).resolve().parents[1]
    names = ('op_partystrength','mem_get','mem_set','blk','pc','opp','cur_op',
             'party_strength','is_gen2','short_opframes','is_dok','flag_eq')
    folder = tmp_path_factory.mktemp('secret-strength-native-red')
    # Pin the pre-fix counterfactual, rather than requiring live code to keep
    # its defect after the forthcoming native implementation changes.
    archive = subprocess.run(['git','archive','--format=zip',
                              'b17225de95878cddefd0da2f158f12fe9849af71','native/src'],
                             cwd=root,capture_output=True)
    if archive.returncode:
        pytest.skip('historical native source object unavailable')
    with zipfile.ZipFile(BytesIO(archive.stdout)) as snapshot:
        for entry in snapshot.infolist():
            target = (folder/entry.filename).resolve()
            target.relative_to(folder.resolve())
            assert entry.filename.startswith('native/src/') or (entry.is_dir() and entry.filename == 'native/')
        snapshot.extractall(folder)
    source, binary = folder/'probe.asm', folder/'probe.bin'
    source.write_text('cpu 386\nbits 16\norg 100h\ndw '+','.join(names)+
                      '\n%include "ccecl.asm"\n', encoding='ascii')
    nasm = shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    result = subprocess.run([nasm,'-I',str(folder/'native/src')+'/', '-f','bin',
                             str(source),'-o',str(binary)], capture_output=True,text=True)
    assert result.returncode == 0, result.stdout+result.stderr
    data = binary.read_bytes()
    return data, dict(zip(names,struct.unpack_from('<'+'H'*len(names),data)))


def test_archived_native_missing_destination_and_flag_clobber_are_verified_red(legacy_native, oracle):
    original = compare(oracle, [])  # A null original list still stores zero.
    native = NativeMachine(legacy_native,{})
    native.put('blk',b'\x1d\x03\x10\x4b\x00')
    native.put('pc',b'\0\0'); native.put('opp',b'\1\0'); native.put('cur_op',b'\x1d')
    native.put('is_gen2',b'\0'); native.put('short_opframes',b'\0'); native.put('is_dok',b'\0')
    native.put('party_strength',b'\0\0')
    native.put('flag_eq',bytes((1,0,0,0,1,1)))
    native.call('mem_set',BX=0x4b10,AX=0xa55a)
    native.call('op_partystrength')
    native.call('mem_get',BX=0x4b10)
    assert original.value == 0
    assert native.uc.reg_read(x86.UC_X86_REG_AX) == 0xa55a
    assert native.get('flag_eq',6) != bytes((1,0,0,0,1,1))
    assert struct.unpack('<H',native.get('pc',2))[0] == 4
