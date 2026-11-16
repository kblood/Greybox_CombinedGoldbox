"""GBOC v1: versioned RNG/damage output-ownership record for staged CoK mutation.

Design doc: docs/engine/research/cok-mutation-output-ownership.md. This module
is the concretely-checkable half of that design: a packable/validatable record
plus a narrow RNG-only activation step. It is a Python reference model only --
no native (.asm) source is changed by this module, and no GBBOOT/CCINV/CCECL
behavior changes. Effect 7 (and every other callback) stays unauthorized for
output: AUTHORIZED_OUTPUT_CALLBACKS is empty on purpose. This module does not
lift, and must never be used to lift, the existing structural rejection of
effect 7 in tools.cok_item_removal.remove (raised for any kind not in
(0x0C, 0x0E, 0x17, 0x26) before this module is ever reached).

Field layout (40 bytes, all integers little-endian):

| Offset | Size | Meaning |
| --- | --- | --- |
| 0  | 4 | 'GBOC' |
| 4  | 2 | Version 1 |
| 6  | 2 | Length 40 |
| 8  | 2 | Callback id claiming this output |
| 10 | 1 | Write flag: 0 no RNG/damage output, 1 present |
| 11 | 1 | Reserved zero |
| 12 | 2 | RNG draws consumed since the paused GBEF state |
| 14 | 2 | Reserved zero |
| 16 | 4 | RNG state before (must equal the paused GBEF's stored state) |
| 20 | 4 | RNG state after (must equal folding `draws` cok_rng.step calls over state-before) |
| 24 | 2 | Target one-based party ordinal for the pending damage event, 0 if write flag clear |
| 26 | 1 | Damage byte value, 0-255, 0 if write flag clear |
| 27 | 1 | Reserved zero |
| 28 | 2 | Pending DAMAGE queue slot descriptor, 0 if write flag clear (see NOTE below) |
| 30 | 6 | Reserved zero |
| 36 | 4 | CRC32 of bytes 0..35 |

NOTE on damage: this record only carries damage *provenance* (which callback,
which target, what value, what queue slot it would occupy). It intentionally
does NOT define how that value is written into a live GBPR HP byte, because
docs/engine/research/cok-item-removal-native-plan.md's 2026-09-08 task-1
section proved 14F24h (effect 7's damage routine) never writes the HP field
itself -- its own caller, not yet located by address, is the consumer. Modeling
an HP-write rule here without knowing that caller's contract would be a
fabricated claim. apply() below only ever mutates the RNG field; it returns the
damage/target/queue fields unapplied for the caller to inspect.
"""
import struct
import zlib

from tools.cok_rng import step

MAGIC = b'GBOC'
VERSION = 1
LENGTH = 40
GBEF_RNG_OFFSET = 126  # matches tools.cok_mutation_packet.request's `effects, 122` area/pc read: area@122, pc@124, rng@126.

# No callback is authorized to produce RNG/damage output yet. Effect 7 (id 7)
# is not special-cased here -- it simply is not, and must not be, a member of
# this set until its unlocated caller and HP-writeback contract are found.
AUTHORIZED_OUTPUT_CALLBACKS = frozenset()


def pack(*, callback_id, write_flag, draws=0, rng_before, rng_after,
         target_ordinal=0, damage=0, queue_slot=0):
    if not 0 <= callback_id <= 0xFFFF:
        raise ValueError('callback id must be an unsigned word')
    if write_flag not in (0, 1):
        raise ValueError('write flag must be 0 or 1')
    if not write_flag and (draws or target_ordinal or damage or queue_slot):
        raise ValueError('output fields must be zero when the write flag is clear')
    if write_flag and not draws:
        raise ValueError('a present output must consume at least one RNG draw')
    for value, bound in ((draws, 0xFFFF), (rng_before, 0xFFFFFFFF), (rng_after, 0xFFFFFFFF),
                         (target_ordinal, 0xFFFF), (damage, 0xFF), (queue_slot, 0xFFFF)):
        if not 0 <= value <= bound:
            raise ValueError('output field out of its declared bound')
    raw = bytearray(LENGTH)
    struct.pack_into('<4sHHHBBHHIIHBBH6s', raw, 0, MAGIC, VERSION, LENGTH, callback_id,
                     write_flag, 0, draws, 0, rng_before, rng_after, target_ordinal,
                     damage, 0, queue_slot, bytes(6))
    struct.pack_into('<I', raw, 36, zlib.crc32(raw[:36]))
    return bytes(raw)


def validate(record, *, gbef_rng, roster_owner_count):
    """Reject malformed or unauthorized output before any activation.

    Raises ValueError with a specific reason on any rejection. Returns a parsed
    dict only when every check passes. Never mutates its inputs.
    """
    if len(record) != LENGTH:
        raise ValueError('GBOC record must be exactly 40 bytes')
    if record[:4] != MAGIC:
        raise ValueError('bad GBOC magic')
    version, length = struct.unpack_from('<HH', record, 4)
    if version != VERSION or length != LENGTH:
        raise ValueError('unsupported GBOC version/length')
    if zlib.crc32(record[:36]) != struct.unpack_from('<I', record, 36)[0]:
        raise ValueError('GBOC checksum mismatch')
    if record[11] != 0 or record[14:16] != bytes(2) or record[27] != 0 or record[30:36] != bytes(6):
        raise ValueError('GBOC reserved bytes must be zero')
    callback_id, write_flag = struct.unpack_from('<HB', record, 8)
    draws, = struct.unpack_from('<H', record, 12)
    rng_before, rng_after = struct.unpack_from('<II', record, 16)
    target_ordinal, damage = struct.unpack_from('<HB', record, 24)
    queue_slot, = struct.unpack_from('<H', record, 28)
    if write_flag not in (0, 1):
        raise ValueError('GBOC write flag must be 0 or 1')
    if rng_before != gbef_rng:
        raise ValueError('GBOC RNG-before does not match the paused GBEF state')
    if not write_flag:
        if draws or target_ordinal or damage or queue_slot or rng_after != rng_before:
            raise ValueError('GBOC output fields must be zero when the write flag is clear')
        return dict(callback_id=callback_id, write_flag=0, draws=0, rng_before=rng_before,
                   rng_after=rng_before, target_ordinal=0, damage=0, queue_slot=0)
    if callback_id not in AUTHORIZED_OUTPUT_CALLBACKS:
        raise ValueError(f'callback {callback_id:#06x} is not authorized for RNG/damage output')
    if not 1 <= draws <= 0xFFFF:
        raise ValueError('GBOC draws must be a positive word')
    expected = rng_before
    for _ in range(draws):
        expected = step(expected)
    if rng_after != expected:
        raise ValueError('GBOC RNG-after does not fold from RNG-before by the declared draw count')
    if not 1 <= target_ordinal <= roster_owner_count:
        raise ValueError('GBOC target ordinal is not a live roster member')
    return dict(callback_id=callback_id, write_flag=1, draws=draws, rng_before=rng_before,
               rng_after=rng_after, target_ordinal=target_ordinal, damage=damage,
               queue_slot=queue_slot)


def apply(gbef, parsed):
    """Replace only the paused RNG field. Damage/target/queue stay unapplied.

    `gbef` must be the full 5750-byte paused GBEF (or a same-shape fixture with
    the RNG field at the documented offset). Returns new GBEF bytes; the input
    is not mutated. The returned `pending` dict carries the still-unapplied
    damage/target/queue fields so a caller cannot silently believe HP was
    written -- see the module docstring for why this module does not write it.
    """
    if len(gbef) != 5750:
        raise ValueError('GBEF must be exactly 5750 bytes')
    if struct.unpack_from('<I', gbef, GBEF_RNG_OFFSET)[0] != parsed['rng_before']:
        raise ValueError('GBEF RNG state no longer matches the validated record')
    result = bytearray(gbef)
    struct.pack_into('<I', result, GBEF_RNG_OFFSET, parsed['rng_after'])
    pending = dict(target_ordinal=parsed['target_ordinal'], damage=parsed['damage'],
                  queue_slot=parsed['queue_slot']) if parsed['write_flag'] else None
    return bytes(result), pending
