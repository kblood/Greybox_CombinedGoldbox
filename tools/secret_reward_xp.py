"""Read-only fixed Secret gift XP projection, not combat or owner authority.

6DA3: suppression is a u16 nonzero test; eligibility uses two raw bytes.
Current-field thresholds are unsigned byte comparisons. C5D:0294 divides
signed 32-bit quantities with truncation toward zero. XP additions wrap u32.
Class bytes outside the explicit cases preserve the unchanged source share.
The signed class-range comparisons exclude bytes128..255 from classes10..14.
"""
from dataclasses import dataclass
import struct

BODY_BYTES = 439
GIFT_XP = 15000
MASK32 = 0xffffffff


def _body(body):
    if len(body) != BODY_BYTES:
        raise ValueError('exact 439-byte actor body required')


def eligible(body):
    _body(body)
    return body[423] != 0 and body[422] != 1


def divide_share(physical_count, exclusions):
    if not 1 <= physical_count <= 6 or not 0 <= exclusions < physical_count:
        raise ValueError('invalid or zero eligible denominator')
    return GIFT_XP // (physical_count - exclusions)


def signed_divide_u32(value, divisor):
    """Original long-integer division, represented as raw portable u32 bits."""
    if not 0 <= value <= MASK32 or divisor <= 0:
        raise ValueError('invalid scalar division')
    signed = value if value < 0x80000000 else value - 0x100000000
    quotient = abs(signed) // divisor
    return (-quotient if signed < 0 else quotient) & MASK32


def award_scalar(body, share, suppression=0):
    _body(body)
    if not 0 <= share <= MASK32 or not 0 <= suppression <= 0xffff:
        raise ValueError('source scalar width')
    if suppression != 0 or not eligible(body):
        return 0
    kind = body[108]
    thresholds = {0: ((21, 14),), 2: ((17, 15),),
                  3: ((17, 15), (21, 15)),
                  4: ((17, 15), (19, 15), (21, 15)),
                  5: ((19, 15),), 6: ((23, 15),)}
    if kind in thresholds:
        bonus = all(body[offset] > threshold for offset, threshold in thresholds[kind])
        return (share + signed_divide_u32(share, 10)) & MASK32 if bonus else share
    if kind in (8, 10, 11, 12, 13, 14, 16):
        return signed_divide_u32(share, 2)
    if kind in (9, 15):
        return signed_divide_u32(share, 3)
    return share  # Source classes 1 and 7 have no current-field adjustment.


@dataclass(frozen=True)
class FixedGiftXP:
    physical_count: int
    exclusions: int
    denominator: int
    share: int
    awards: tuple[int, ...]
    new_xp: tuple[int, ...]


def compute(bodies, suppression=0):
    """Derive all scalars without mutation; refuse zero eligibility even suppressed."""
    bodies = tuple(bodies)
    if not 1 <= len(bodies) <= 6:
        raise ValueError('physical party count outside 1..6')
    exclusions = sum(not eligible(body) for body in bodies)
    share = divide_share(len(bodies), exclusions)
    awards = tuple(award_scalar(body, share, suppression) for body in bodies)
    new_xp = tuple((struct.unpack_from('<I', body, 300)[0] + award) & MASK32
                   for body, award in zip(bodies, awards))
    return FixedGiftXP(len(bodies), exclusions, len(bodies)-exclusions, share, awards, new_xp)
