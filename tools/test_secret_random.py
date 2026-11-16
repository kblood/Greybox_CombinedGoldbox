"""Complete original RANDOM versus independent recurrence/range semantics."""
import hashlib
from pathlib import Path
import struct

import pytest

from tools.secret_melee_oracle import ACTOR_BASE, LOAD_IMAGE_HASH, load
from tools.secret_player_oracle import PLAYER_DATA
from tools.secret_random import ecl_random, random_step
from tools.secret_random_oracle import (
    CONVERSIONS, HANDLER, RESIDENT_RANDOM, RESIDENT_STEP, SEED, RandomMachine,
)
from tools.secret_continuation import source_member

MULTIPLIER = 0x08088405
INVERSE = pow(MULTIPLIER, -1, 1 << 32)
SEEDS = (0,1,2,0x1234,0x80000000,0xFFFFFFFF,
         (-INVERSE) & 0xFFFFFFFF, ((0x00FF0000-1)*INVERSE) & 0xFFFFFFFF,
         ((0xFFFF0000-1)*INVERSE) & 0xFFFFFFFF)
RANGES = (0,1,2,99,254,255,256,257,511,65535)
FLAGS = bytes((1,0,1,0,1,0))
ACTORS = tuple(bytes((i + 37*actor)&255 for i in range(439)) for actor in range(6))


@pytest.fixture(scope='module')
def retail():
    source = load()
    assert hashlib.sha256(source.overlay).hexdigest() == 'd4f900391703bbfd5a4f66703871b64782dff2307224cd2560e40e1b60779c80'
    assert hashlib.sha256(source.image).hexdigest() == LOAD_IMAGE_HASH
    return source


def instruction(range_word, *, variable=None, destination=0x4C0F):
    operand = b'\2' + struct.pack('<H',range_word) if variable is None else b'\1' + struct.pack('<H',variable)
    return b'\x08' + operand + b'\1' + struct.pack('<H',destination)


def assert_handler_witness(machine, result, seed, range_word, pc, size):
    byte = range_word & 255
    assert result.seed_before == seed and result.resolved_range == range_word
    assert result.resident_bounds == (byte + (byte != 255),)
    assert (result.value,result.seed_after) == ecl_random(seed,range_word)
    assert result.pc == pc + size and result.comparison == FLAGS
    assert result.actor_bytes == b''.join(ACTORS)
    required = {machine.location(offset) for offset in (HANDLER,0x9073,0x91AB,0x9727,0x9F3A)}
    required |= {0x10000 + offset for offset in (RESIDENT_RANDOM,RESIDENT_STEP,*CONVERSIONS)}
    assert required <= result.visited
    assert {(PLAYER_DATA+SEED,2),(PLAYER_DATA+SEED+2,2)} <= set(result.reads)
    assert any(address == result.destination and size == 2 for address,size,value in result.writes)
    assert not any(ACTOR_BASE <= address < ACTOR_BASE + 6*439 for address,size in result.reads)


@pytest.mark.parametrize('seed',SEEDS)
@pytest.mark.parametrize('range_word',RANGES)
def test_complete_original_literal_random_executes_parser_rng_conversions_and_store(retail,seed,range_word):
    machine = RandomMachine(retail)
    code = instruction(range_word)
    result = machine.run_instruction(code,seed=seed,actors=ACTORS)
    assert_handler_witness(machine,result,seed,range_word,0x8000,len(code))
    assert result.operands == ((2,range_word),(1,0x4C0F))


@pytest.mark.parametrize('seed',SEEDS)
@pytest.mark.parametrize('range_word',RANGES)
@pytest.mark.parametrize('selector',[0x4C0E,0x7F78])
def test_original_sparse_word_resolution_precedes_byte_truncation(retail,seed,range_word,selector):
    machine = RandomMachine(retail)
    code = instruction(range_word,variable=selector,destination=0x7F79)
    result = machine.run_instruction(code,seed=seed,actors=ACTORS,variables=((selector,range_word),),pc=0x8A40)
    assert_handler_witness(machine,result,seed,range_word,0x8A40,len(code))
    assert result.operands == ((1,selector),(1,0x7F79))
    assert {machine.location(0xA0F1),machine.location(0x9774)} <= result.visited
    assert (machine.variable_address(selector),2) in result.reads


@pytest.mark.parametrize('seed',SEEDS)
@pytest.mark.parametrize('bound',[0,1,2,100,255,256,65535])
def test_complete_original_resident_random_including_bound_zero_advances_once(retail,seed,bound):
    machine = RandomMachine(retail)
    result = machine.resident_random(bound,seed=seed,actors=ACTORS)
    assert (result.value,result.seed_after) == random_step(seed,bound)
    assert result.seed_before == seed and result.resident_bounds == (bound,)
    assert result.resolved_range is None and result.destination is None
    assert {0x10000+RESIDENT_RANDOM,0x10000+RESIDENT_STEP} <= result.visited
    assert result.comparison == FLAGS and result.actor_bytes == b''.join(ACTORS)
    assert result.data_changes <= set(range(SEED,SEED+4))


@pytest.mark.parametrize('seed',SEEDS)
def test_consecutive_complete_original_calls_carry_the_observed_full_seed(retail,seed):
    machine = RandomMachine(retail)
    current = seed
    for ordinal,maximum in enumerate((99,0,255,256,257,1,65535,99)):
        result = machine.run_instruction(instruction(maximum),seed=current,actors=ACTORS,pc=0x8000+ordinal*7)
        assert (result.value,result.seed_after) == ecl_random(current,maximum)
        assert result.seed_before == current
        current = result.seed_after


@pytest.mark.parametrize('seed',SEEDS)
@pytest.mark.parametrize('range_word',[0,99,255,256,65535])
def test_narrow_read_hooks_are_invariant_against_no_read_hook_original_execution(retail,seed,range_word):
    results = [RandomMachine(retail).run_instruction(instruction(range_word),seed=seed,actors=ACTORS,
                                                   observe_reads=observed) for observed in (False,True)]
    first,second = results
    assert not first.reads and second.reads
    assert (first.value,first.seed_after,first.pc,first.operands,first.resident_bounds,
            first.data_changes,first.writes,first.visited,first.actor_bytes,first.comparison) == (
            second.value,second.seed_after,second.pc,second.operands,second.resident_bounds,
            second.data_changes,second.writes,second.visited,second.actor_bytes,second.comparison)


def test_actual_held_random99_instruction_complete_original_execution(retail):
    archive = Path(r'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDLoad Collection\Games-WHDLoad\unpacked\SecretOfTheSilverBlades\data\DISK2\ECL.GLB')
    if not archive.is_file(): pytest.skip('held Secret Amiga source unavailable')
    data = archive.read_bytes()
    assert hashlib.sha256(data).hexdigest() == '8c247ad1e1acceb02061197ea6745f5e090189a77dd8295f61b30ef90f390d12'
    code = source_member(data,49)[0xA40:0xA46]
    assert code == bytes.fromhex('08 00 63 01 79 7f')
    machine = RandomMachine(retail)
    result = machine.run_instruction(code,seed=2,actors=ACTORS,pc=0x8A40)
    assert_handler_witness(machine,result,2,99,0x8A40,6)
    assert result.operands == ((0,99),(1,0x7F79)) and result.value == 13 and result.seed_after == 0x1011080B


def test_ff_is_saturated_instead_of_incrementing_to_256(retail):
    seed = ((0x00FF0000-1)*INVERSE) & 0xFFFFFFFF
    result = RandomMachine(retail).run_instruction(instruction(255),seed=seed,actors=ACTORS)
    assert result.seed_after == 0x00FF0000 and result.resident_bounds == (255,) and result.value == 0
    assert random_step(seed,256)[0] == 255, 'control must distinguish saturation'


@pytest.mark.parametrize('seed,bound', [(-1,1),(1<<32,1),(1,-1),(1,65536)])
def test_independent_model_rejects_undeclared_widths(seed,bound):
    with pytest.raises(ValueError): random_step(seed,bound)


def test_variable_input_cannot_be_implicitly_zero(retail):
    with pytest.raises(ValueError,match='explicit preimage'):
        RandomMachine(retail).run_instruction(instruction(0,variable=0x7F78),seed=1)


@pytest.mark.parametrize('selector',[0x4C0E,0x7F79])
@pytest.mark.parametrize('range_word',[255,256,257])
def test_in_place_variable_range_is_read_before_its_original_destination_store(retail,selector,range_word):
    machine = RandomMachine(retail)
    code = instruction(range_word,variable=selector,destination=selector)
    result = machine.run_instruction(code,seed=0x1234,actors=ACTORS,variables=((selector,range_word),))
    assert_handler_witness(machine,result,0x1234,range_word,0x8000,len(code))
    assert result.operands == ((1,selector),(1,selector))
    assert result.resolved_range == range_word and (result.value,result.seed_after) == ecl_random(0x1234,range_word)
    assert (machine.variable_address(selector),2) in result.reads


def test_in_place_preimage_cannot_be_declared_twice_with_conflicting_values(retail):
    with pytest.raises(ValueError,match='one consistent preimage'):
        RandomMachine(retail).run_instruction(instruction(255,variable=0x7F79,destination=0x7F79),seed=1,
                                             variables=((0x7F79,255),),previous=256)
