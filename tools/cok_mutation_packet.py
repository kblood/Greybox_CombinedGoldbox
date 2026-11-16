"""GBMR combined mutation packet construction and reference response.

The native helper stages content only. Its output is not permission to resume:
the host must match the pending VM/block and activate the combined candidate.
"""
import struct
import zlib

from tools.cok_inventory import decode, checksum
from tools.cok_party_removal import stage

CORE_LEN = 13224
# GBMR v3 (2026-09-09, docs/engine/research/cok-mutation-output-ownership.md):
# byte-identical to v2 across [0, CORE_LEN), with one 40-byte GBOC v1 record
# appended at CORE_LEN. See with_gboc() below.
CORE_LEN_V3 = 13264
MB_LEN = 672
# GBMB v3: byte-identical to v2 across [0, MB_LEN), with the same 40-byte
# GBOC v1 record appended at MB_LEN; mutation_request_body (cokrequest.inc)
# copies it verbatim into the constructed GBMR request's own CORE_LEN slot.
MB_LEN_V3 = 712
FX = 48
ROSTER = 5798
OWNED = 8274
TIMERS = 8532
FRAME = 11112
TABLE = 11144
TYPES = 13192


def manifest(paths, learning, *, damage_watermark=None, gboc=None):
    """GBMB v1/v2/v3: learning and paths, with an optional DAMAGE watermark
    and/or (v3 only) an appended 40-byte GBOC v1 output-authorization record.
    """
    if len(paths) != 5 or len(learning) != 8:
        raise ValueError('five paths and eight learning bytes required')
    length = MB_LEN_V3 if gboc is not None else MB_LEN
    raw = bytearray(length)
    version = 3 if gboc is not None else (2 if damage_watermark is not None else 1)
    struct.pack_into('<4sHH', raw, 0, b'GBMB', version, length)
    if damage_watermark is not None:
        if not 0 <= damage_watermark <= 64:
            raise ValueError('bounded damage watermark required')
        struct.pack_into('<H', raw, 8, damage_watermark)
    raw[16:24] = learning
    for index, path in enumerate(paths):
        value = path.encode('ascii')
        if not value or len(value) > 127 or b'\0' in value:
            raise ValueError('nonempty bounded ASCIIZ paths required')
        offset = 32+index*128
        raw[offset:offset+len(value)] = value
    if gboc is not None:
        if len(gboc) != 40:
            raise ValueError('GBOC record must be exactly 40 bytes')
        raw[MB_LEN:MB_LEN+40] = gboc
    return seal(raw)


def with_gboc(packet, gboc):
    """Extend a v1/v2 CORE_LEN request/candidate core to the v3 GBMR shape:
    version bumped to 3, the coreLen header word set to CORE_LEN_V3, and the
    40-byte GBOC v1 record appended at CORE_LEN -- byte-identical to the
    source packet across [0, CORE_LEN) apart from those two header words.
    Mirrors the "GBMR v3 design" doc section exactly."""
    if len(packet) != CORE_LEN:
        raise ValueError('v1/v2-length core required')
    if len(gboc) != 40:
        raise ValueError('GBOC record must be exactly 40 bytes')
    result = bytearray(packet) + bytearray(gboc)
    struct.pack_into('<H', result, 4, 3)
    struct.pack_into('<H', result, 24, CORE_LEN_V3)
    return seal(result)


def seal(raw):
    result = bytearray(raw)
    struct.pack_into('<I', result, 28, checksum(result))
    return bytes(result)


def request(roster, inventory, timers, definitions, effects, *, successor,
            block_length, comparisons=(0, 0), flags=bytes(6), selected=0,
            selected_valid=False, not_found=False, learning=bytes(8)):
    if (len(roster) > 2476 or len(timers) != 2572 or len(definitions) != 2048
            or len(effects) != 5750 or len(flags) != 6 or len(learning) != 8):
        raise ValueError('complete mutation input records required')
    result = bytearray(CORE_LEN)
    area, pc = struct.unpack_from('<HH', effects, 122)
    # Caller sets the target separately through with_target; zero is valid.
    struct.pack_into('<4s12H', result, 0, b'GBMR', 1, 1, 0, area, pc, successor,
                     0, 0, len(roster), 5750, CORE_LEN, 0)
    result[FX:FX+5750] = effects
    result[ROSTER:ROSTER+len(roster)] = roster
    result[TIMERS:TIMERS+2572] = timers
    result[11104:11112] = learning
    struct.pack_into('<4s4H', result, FRAME, b'GBMC', 1, 32, *comparisons)
    result[FRAME+12:FRAME+18] = flags
    struct.pack_into('<BBHHII', result, FRAME+18, selected_valid, not_found,
                     selected, block_length, zlib.crc32(inventory), len(inventory))
    result[TABLE:TABLE+2048] = definitions
    struct.pack_into('<H', result, OWNED, 1)
    for offset in range(12, 12+10*struct.unpack_from('<H', timers, 2)[0], 10):
        owner, kind = timers[offset:offset+2]
        if kind:
            result[OWNED+2+32*(owner-1)+(kind >> 3)] |= 1 << (kind & 7)
    for inv in decode(inventory):
        for offset in range(0, len(inv.records), 63):
            kind = inv.records[offset+46]
            result[TYPES+(kind >> 3)] |= 1 << (kind & 7)
    return seal(result)


def with_target(packet, target):
    if not 0 <= target <= 255:
        raise ValueError('byte item target required')
    result = bytearray(packet)
    struct.pack_into('<H', result, 16, target)
    return seal(result)


def from_yield(yield_record, effects, roster, inventory, timers, definitions, *, learning=bytes(8)):
    """Bind a fresh CCECL GBIY export to the owned mutation inputs.

GBMC records pre-operand selection state. Continuation must consume the checked
operand once after success, including any selected-status accessor side effect.
    """
    if (len(yield_record) != 72 or yield_record[:8] != b'GBIY\x02\0\x48\0'
            or len(effects) != 5750
            or zlib.crc32(yield_record[:68]) != struct.unpack_from('<I', yield_record, 68)[0]
            or zlib.crc32(effects) != struct.unpack_from('<I', yield_record, 48)[0]):
        raise ValueError('invalid or mismatched inventory yield')
    failed, successor, target, area = struct.unpack_from('<4H', yield_record, 8)
    frame = yield_record[16:48]
    if (frame[:8] != b'GBMC\x01\0\x20\0' or frame[24:] != bytes(8)
            or (area, failed) != struct.unpack_from('<HH', effects, 122)
            or not 22 <= failed < successor <= struct.unpack_from('<H', frame, 22)[0] <= 16384
            or any(value > 1 for value in frame[12:20])):
        raise ValueError('invalid inventory continuation frame')
    steps, chains, repeats, damage = struct.unpack_from('<4H', yield_record, 52)
    if (not 1 <= steps < 60000 or chains > 32 or repeats >= 16
            or damage > struct.unpack_from('<H', effects, 2250)[0]
            or yield_record[64:68] != bytes(4)):
        raise ValueError('invalid inventory execution context')
    result = bytearray(with_target(request(
        roster, inventory, timers, definitions, effects, successor=successor,
        block_length=struct.unpack_from('<H', frame, 22)[0],
        comparisons=struct.unpack_from('<HH', frame, 8), flags=frame[12:18],
        selected=struct.unpack_from('<H', frame, 20)[0], selected_valid=frame[18],
        not_found=frame[19], learning=learning), target))
    struct.pack_into('<H', result, 4, 2)
    result[32:48] = yield_record[52:68]
    return seal(result)


def response(packet, inventory):
    """Reference bytes for a well-formed request; malformed fixtures test DOS.

    GBMR v3 (2026-09-09): a CORE_LEN_V3 packet routes its appended GBOC v1
    record through tools.cok_party_removal.stage's gboc/gbef_rng parameters,
    exercising the same authorize_effect7 model cokremove.inc's
    cm_authorize_output mirrors, and folds core+174 (the paused GBEF RNG
    dword) forward exactly as native/src/cokmutation.inc's .gboc:/.invoke:
    owner loop does before mr_finish's final full-core write. The appended
    GBOC block itself is copied through byte-for-byte unchanged, matching
    real M-stage (it never rewrites the record, only core+174)."""
    length = len(packet)
    if length not in (CORE_LEN, CORE_LEN_V3):
        raise ValueError('invalid request length/checksum')
    if checksum(packet) != struct.unpack_from('<I', packet, 28)[0]:
        raise ValueError('invalid request length/checksum')
    if (zlib.crc32(inventory), len(inventory)) != struct.unpack_from('<II', packet, FRAME+24):
        raise ValueError('inventory differs from request')
    roster_len = struct.unpack_from('<H', packet, 20)[0]
    target = struct.unpack_from('<H', packet, 16)[0]
    v3 = length == CORE_LEN_V3
    kwargs, gboc_block = {}, b''
    if v3:
        gboc_block = bytes(packet[CORE_LEN:CORE_LEN+40])
        kwargs = dict(gboc=gboc_block, gbef_rng=struct.unpack_from('<I', packet, 174)[0])
    result = stage(packet[ROSTER:ROSTER+roster_len], inventory,
                   packet[TIMERS:TIMERS+2572], packet[TABLE:TABLE+2048], target, **kwargs)
    raw = bytearray(packet[:CORE_LEN])
    struct.pack_into('<H', raw, 8, 1)
    raw[ROSTER:ROSTER+roster_len] = result.roster
    raw[TIMERS:TIMERS+2572] = result.timers
    raw[OWNED:OWNED+258] = result.owned_effects
    raw[TYPES:TYPES+32] = result.item_types
    if v3:
        struct.pack_into('<I', raw, 174, result.gbef_rng)
        raw += gboc_block
    return seal(raw+result.inventory)


def activation_seed(seed, candidate):
    """Reference active GBPS bytes: retain prefix, replace owned state/movement."""
    if len(seed) != 3160 or len(candidate) < CORE_LEN+16:
        raise ValueError('complete seed and candidate required')
    raw = bytearray(seed)
    raw[282:3112] = candidate[OWNED:11104]
    raw[3128:] = candidate[TYPES:CORE_LEN]
    count = struct.unpack_from('<H', candidate, ROSTER+6)[0]
    if count > 6:
        raise ValueError('bounded party required')
    raw[17] = count
    raw[70:86] = bytes(16)
    for index in range(count):
        struct.pack_into('<H', raw, 70+index*2, candidate[ROSTER+16+index*410+1+408])
    return bytes(raw)
