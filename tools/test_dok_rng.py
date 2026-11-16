"""DoK RNG parity against the unchanged original START.EXE/GAME.OVR routines (Unicorn)."""
from pathlib import Path
import random
import struct

import pytest

pytest.importorskip('unicorn')
from tools.dok_rng import MULTIPLIER, ecl_random, dice
from tools import dok_rng_oracle as oracle

ROOT = Path(__file__).resolve().parents[1]
SEEDS = (0, 1, 0x1234, 0xDEADBEEF, 0xFFFFFFFF)
WRONG = (0x08088404, 0x08088405 ^ 0x00010000, 0x000343FD, 0x015A4E35, 0x0808 << 16 | 0x8406)


@pytest.fixture(scope='module')
def retail():
    game = ROOT/'Death Knights of Krynn'
    if any(not (game/n).exists() for n in ('START.EXE', 'GAME.OVR')):
        pytest.skip('held DoK unavailable')
    return oracle.load(game)


def stream(maximum):
    return bytes((8, 0, maximum, 1, 0, 0x90))


def test_multiplier_recovered_from_original_code(retail):
    """Seed 1 maps to M*1+1, so the original routine reveals M directly; also check linearity."""
    m = oracle.Machine(retail)
    m.set_state(1)
    m.resident_random(0)
    assert (m.state()-1) & 0xFFFFFFFF == MULTIPLIER
    rng = random.Random(7)
    for _ in range(300):
        seed = rng.getrandbits(32)
        m.set_state(seed)
        m.resident_random(0)
        assert m.state() == (seed*MULTIPLIER+1) & 0xFFFFFFFF


def test_constant_is_a_low_word_plus_code_derived_high_word(retail):
    image, overlay = retail
    # low word 8405h is stored once, right before the INT 21h helper, at the Random routine's cs:1671
    assert [i for i in range(len(image)-1) if image[i:i+2] == b'\x05\x84' and image[i+2] == 0xB4] == [oracle.MULT_LOW_FILE]
    assert struct.unpack_from('<H', image, oracle.MULT_LOW_FILE)[0] == 0x8405
    # nothing in the overlay writes the RandSeed words DS:84AC/84AE (null: pattern hits are noise)
    assert oracle.STATE_OFF == 0x84AC
    # the image holds the 32-bit constant only as 0x8405 + shift/add code; a contiguous dword is absent
    assert struct.pack('<I', MULTIPLIER) not in image and struct.pack('<I', MULTIPLIER) not in overlay


@pytest.mark.parametrize('maximum', range(256))
def test_original_ecl_random_all_byte_maxima(retail, maximum):
    m = oracle.Machine(retail)
    for seed in SEEDS:
        state, result, pc = m.ecl_random(stream(maximum), seed)
        assert (state, result) == ecl_random(seed, maximum)
        assert pc == 0x8006


@pytest.mark.parametrize('count', (0, 1, 2, 3, 255))
@pytest.mark.parametrize('sides', (0, 1, 4, 6, 127, 255))
def test_original_dice_state_count_and_wrapping(retail, count, sides):
    m = oracle.Machine(retail)
    for seed in SEEDS:
        state, total, stored = m.dice(seed, count, sides)
        assert (state, total) == dice(seed, count, sides)
        assert stored == count


@pytest.mark.parametrize('maximum', (0, 255, 256, 511, 65535))
def test_original_variable_maximum_uses_low_byte(retail, maximum):
    m = oracle.Machine(retail)
    m.uc.mem_write(0x75000, bytes((8, 1, 0, 0x90, 1, 2, 0x90)))
    m.uc.mem_write(0x76000, struct.pack('<H', maximum)+b'\xa5')
    m.set_state(0xDEADBEEF)
    m.overlay_call(oracle.ECL_RANDOM_FILE)
    assert (m.state(), m.uc.mem_read(0x76002, 1)[0]) == ecl_random(0xDEADBEEF, maximum)
    assert struct.unpack('<H', m.uc.mem_read(oracle.DS_BASE+oracle.PC_OFF, 2))[0] == 0x8007


@pytest.mark.parametrize('seed', SEEDS)
def test_original_mixed_random_and_dice_share_one_state(retail, seed):
    m = oracle.Machine(retail)
    m.set_state(seed)
    state = seed
    for i in range(40):
        maximum = (i*17) & 255
        m.uc.mem_write(0x75000, stream(maximum))
        m.uc.mem_write(oracle.DS_BASE+oracle.PC_OFF, struct.pack('<H', 0x8000))
        m.overlay_call(oracle.ECL_RANDOM_FILE)
        state, result = ecl_random(state, maximum)
        assert m.uc.mem_read(0x76000, 1)[0] == result and m.state() == state
        count, sides = i % 4, (0, 1, 4, 6, 255)[i % 5]
        m.overlay_call(oracle.DICE_WRAPPER_FILE, struct.pack('<HH', sides, count))
        state, result = dice(state, count, sides)
        assert m.uc.reg_read(oracle.UC_X86_REG_AX) & 255 == result and m.state() == state


def agree(retail, multiplier):
    """True when the model with `multiplier` matches the original on all 256 maxima x 5 seeds + dice."""
    m = oracle.Machine(retail)
    for maximum in range(256):
        for seed in SEEDS:
            got = m.ecl_random(stream(maximum), seed)[:2]
            if got != ecl_random(seed, maximum, multiplier):
                return False
    for seed in SEEDS:
        if m.dice(seed, 3, 6)[:2] != dice(seed, 3, 6, multiplier):
            return False
    return True


def test_mutation_wrong_model_multiplier_is_detected(retail):
    assert agree(retail, MULTIPLIER)
    for wrong in WRONG:
        assert not agree(retail, wrong), hex(wrong)


def test_mutation_patched_original_constant_is_detected(retail):
    """Patching 8405h in the loaded copy of the ORIGINAL makes the model disagree (oracle executes the constant)."""
    for low in (0x8406, 0x8404, 0x0405):
        m = oracle.Machine(retail, low_word=low)
        m.set_state(0xDEADBEEF)
        m.resident_random(100)
        assert m.state() != (0xDEADBEEF*MULTIPLIER+1) & 0xFFFFFFFF
