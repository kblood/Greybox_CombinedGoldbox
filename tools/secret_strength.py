"""Original DOS Secret 1Dh arithmetic on declared canonical actor bodies.

This model does not execute original code, follow archived pointers, infer a
party from loose files, or assert an original Amiga handler contract.
"""
from collections.abc import Iterable
from tools.secret_player_stats import PlayerStats


def signed8(value: int) -> int:
    return value if value < 128 else value - 256


def level_predicate(body: bytes) -> int:
    if len(body) != 439:
        raise ValueError('complete canonical Secret actor body required')
    level = 0
    if body[107] == 6:
        index = 0
        while index < 6 and body[273+index] == 0:
            index += 1
        level = body[273+index]
    return int(signed8(level) > signed8(body[239]))


def actor_strength(body: bytes) -> int:
    """Raw byte arithmetic, including signed products and byte intermediates."""
    extra = level_predicate(body)
    first = (signed8(body[285])*extra + signed8(body[278])) & 255
    second = (signed8(body[280])*extra + signed8(body[273])) & 255
    weighted = (body[437] + 5*max(body[427]-60, 0) +
                5*max(body[426]-39, 0) + 8*first + 4*second)
    return (weighted // 10) & 255


def party_strength(bodies: Iterable[bytes]) -> int:
    return sum(actor_strength(body) for body in bodies) & 255


def normal_player_body(player: PlayerStats) -> bytes:
    """Install the independently calculated normal cache used by original 1Dh.

    Archived THAC/AC cache bytes are not authoritative after equipment/class
    setup. This adapter covers normal coefficients, not transient spell/aura
    changes or original party selection.
    """
    result = bytearray(player.body)
    if len(result) != 439:
        raise ValueError('complete normal player body required')
    for offset, value in ((426,60-player.normal.thac0),
                          (427,60-player.normal.armor_class),
                          (437,player.normal.current_hp)):
        if not 0 <= value <= 255:
            raise ValueError('normal player cache exceeds original byte domain')
        result[offset] = value
    return bytes(result)
