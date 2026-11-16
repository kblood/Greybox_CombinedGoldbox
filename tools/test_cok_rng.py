"""RNG state and result parity against unchanged original CoK routines."""
from pathlib import Path
import struct

import pytest

pytest.importorskip('unicorn')
from unicorn.x86_const import UC_X86_REG_AX
from tools.cok_item_removal_oracle import Machine, Member, load
from tools.cok_rng import ecl_random, dice

ROOT = Path(__file__).resolve().parents[1]
SEEDS = (0, 1, 0x1234, 0xDEADBEEF, 0xFFFFFFFF)


@pytest.fixture(scope='module')
def retail():
    game = ROOT/'Champions of Krynn'
    if any(not (game/name).exists() for name in ('START.EXE','GAME.OVR','ITEMS','SAVE/CHRDATA1.SAV')):
        pytest.skip('held CoK unavailable')
    return load(game), (game/'SAVE/CHRDATA1.SAV').read_bytes()


@pytest.mark.parametrize('maximum', range(256))
def test_original_ecl_random_all_byte_maxima(retail, maximum):
    data, body = retail
    for seed in SEEDS:
        machine = Machine(data, (Member(body),))
        machine.uc.mem_write(0x75000, bytes((8,0,maximum,1,0,0x90)))
        machine.uc.mem_write(0x543AE, struct.pack('<I',seed))
        before = machine.snapshot()
        machine.execute(0xBA9)
        state = struct.unpack('<I',machine.uc.mem_read(0x543AE,4))[0]
        result = machine.uc.mem_read(0x76000,1)[0]
        assert (state,result) == ecl_random(seed,maximum)
        after = machine.snapshot()
        assert after.bodies == before.bodies
        assert after.items == before.items and after.effects == before.effects
        assert after.selected == before.selected and after.comparisons == before.comparisons
        assert after.operand_pc == 0x8006


@pytest.mark.parametrize('count', (0,1,2,3,255))
@pytest.mark.parametrize('sides', (0,1,4,6,127,255))
def test_original_dice_state_count_and_wrapping(retail, count, sides):
    data, body = retail
    for seed in SEEDS:
        machine = Machine(data, (Member(body),))
        machine.uc.mem_write(0x543AE,struct.pack('<I',seed))
        before = machine.snapshot()
        machine.execute(0x3520C,struct.pack('<HH',sides,count))
        state = struct.unpack('<I',machine.uc.mem_read(0x543AE,4))[0]
        assert (state,machine.uc.reg_read(UC_X86_REG_AX)&255) == dice(seed,count,sides)
        assert machine.uc.mem_read(0x56B34,1)[0] == count
        assert machine.snapshot() == before


@pytest.mark.parametrize('maximum', (0,255,256,511,65535))
def test_original_variable_maximum_uses_low_byte(retail, maximum):
    data, body = retail
    machine = Machine(data,(Member(body),))
    machine.uc.mem_write(0x75000,bytes((8,1,0,0x90,1,2,0x90)))
    machine.uc.mem_write(0x76000,struct.pack('<H',maximum)+b'\xa5')
    machine.uc.mem_write(0x543AE,struct.pack('<I',0xDEADBEEF))
    machine.execute(0xBA9)
    state = struct.unpack('<I',machine.uc.mem_read(0x543AE,4))[0]
    assert (state,machine.uc.mem_read(0x76002,1)[0]) == ecl_random(0xDEADBEEF,maximum)
    assert bytes(machine.uc.mem_read(0x76000,2)) == struct.pack('<H',maximum)
    assert machine.snapshot().operand_pc == 0x8007


@pytest.mark.parametrize('seed', SEEDS)
def test_original_mixed_random_and_dice_share_one_state(retail, seed):
    data, body = retail
    machine = Machine(data,(Member(body),))
    machine.uc.mem_write(0x543AE,struct.pack('<I',seed))
    state = seed
    for i in range(40):
        maximum = (i*17)&255
        machine.uc.mem_write(0x75000,bytes((8,0,maximum,1,0,0x90)))
        machine.uc.mem_write(0x54B43,struct.pack('<H',0x8000))
        machine.execute(0xBA9)
        state, result = ecl_random(state,maximum)
        assert machine.uc.mem_read(0x76000,1)[0] == result
        assert struct.unpack('<I',machine.uc.mem_read(0x543AE,4))[0] == state
        count, sides = i%4, (0,1,4,6,255)[i%5]
        machine.execute(0x3520C,struct.pack('<HH',sides,count))
        state, result = dice(state,count,sides)
        assert machine.uc.reg_read(UC_X86_REG_AX)&255 == result
        assert struct.unpack('<I',machine.uc.mem_read(0x543AE,4))[0] == state
