"""Clean-room F paired with complete original38589 and source token bytes."""
import hashlib
import struct

import pytest
pytest.importorskip("unicorn")

from tools.secret_reward_names import TOKEN_ROWS, format_pending
from tools.secret_treasure_oracle import PLAYER_DATA
from tools.test_secret_treasure_helpers import gift, SEED, protected, assert_protected


def test_fixed_profile_dictionary_is_exact_original_source_data(gift):
    image = gift.retail.image
    packed = b""
    for token, row in sorted(TOKEN_ROWS.items()):
        assert row == image[0xde20 + 0xf0d + token * 21:0xde20 + 0xf0d + token * 21 + 21]
        packed += struct.pack("<H", token) + row
    assert len(packed) == 506
    assert hashlib.sha256(packed).hexdigest() == "330848154fecaa4ead97efe87078cc82e29c647c995bf38f5863dbdb3bd24a34"


@pytest.mark.parametrize("star,prefix", [(False, False), (True, False), (True, True)])
def test_complete_original_formatter_matches_all42_cache_bytes_and_logical_tails(gift, star, prefix):
    machine = gift
    if star:
        address = 0x40000 + 5 * 439
        machine.call(0x3701D, (0, 255, 0, 5, address % 16, address >> 4),
                     data_base=PLAYER_DATA, seed=SEED)
    actors = bytes(machine.uc.mem_read(0x40000, 6 * 439))
    guard = protected(machine)
    pointer = bytes(machine.uc.mem_read(PLAYER_DATA + 0x87C8, 4))
    for _ in range(12):
        offset, segment = struct.unpack("<HH", pointer)
        address = segment * 16 + offset
        before = bytes(machine.uc.mem_read(address, 67))
        expected = format_pending(before, star, ready_prefix=prefix)
        machine.call(0x38589, (0, int(prefix), 0, 0, offset, segment, 0, 0),
                     data_base=PLAYER_DATA, seed=SEED)
        after = bytes(machine.uc.mem_read(address, 67))
        assert after == expected
        assert after[41:] == before[41:]
        # Remove the longer prefix using the full original routine; stale
        # nonzero bytes beyond the shorter end must remain byte exact.
        machine.call(0x38589, (0, 0, 0, 0, offset, segment, 0, 0),
                     data_base=PLAYER_DATA, seed=SEED)
        after_short = bytes(machine.uc.mem_read(address, 67))
        assert after_short == format_pending(after, star)
        pointer = after[42:46]
    assert pointer == bytes(4)
    assert bytes(machine.uc.mem_read(0x40000, 6 * 439)) == actors
    assert_protected(machine, guard)
