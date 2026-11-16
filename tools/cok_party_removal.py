"""Combined CoK mutation reference for GBPR, GBIV and canonical timer state.

No files are published here. A result exists only after every owner succeeds.
The DOS bridge still needs a request/response envelope and VM continuation.
"""
from dataclasses import dataclass
import struct

from tools.cok_inventory import Inventory, decode, encode
from tools.cok_item_removal import RemovalError, destroy


@dataclass(frozen=True)
class PartyRemoved:
    roster: bytes
    inventory: bytes
    timers: bytes
    owned_effects: bytes
    item_types: bytes
    slots: tuple[tuple[int | None, ...], ...]
    freed: tuple[tuple[int, str, int], ...]
    gbef_rng: int = 0


def stage(roster, inventory, timers, item_table, target, *, gboc=None, gbef_rng=0):
    """Return one complete candidate, preserving owner and global timer order.

Timer owner ordinals are one-based, independent of retail/created source IDs.
Slots in the result refer to compacted per-owner inventory record ordinals.
Existing serialized pointers are opaque input; live output links are zero.

gboc/gbef_rng are additive and OFF by default (gboc=None), matching every
existing caller's prior behaviour exactly. When gboc is a 40-byte GBOC v1
record, its own target_ordinal field (offset 24, one-based) selects the
SINGLE owner that record is routed to via tools.cok_item_removal.destroy's
own gboc/gbef_rng/rng_out parameters -- mirroring
native/src/cokmutation.inc's .gboc:/.invoke: owner loop, which resets
cm_gboc to zero for every owner except the one whose one-based ordinal
matches the record's own target_ordinal. Every other owner's destroy() call
still receives gboc=None, so an applied kind-7 effect on any other owner
still raises RemovalError exactly as before. The returned PartyRemoved's
gbef_rng field carries the (possibly folded) final RNG state; it equals the
input gbef_rng unchanged when gboc is None or the routed record's own write
flag is clear.
"""
    roster, inventory, timers = bytes(roster), bytes(inventory), bytes(timers)
    if len(roster) < 16:
        raise RemovalError('short roster')
    magic, version, count, stride, flags = struct.unpack_from('<4s4H', roster)
    identity, schema = struct.unpack_from('<2H', roster, 12)
    identity_ok = ((version == 1 and roster[12:16] == bytes(4))
                   or (version == 2 and identity == 1 and schema == 1))
    if (magic != b'GBPR' or not identity_ok or count > 6 or stride != 410
            or flags or len(roster) != 16+count*410):
        raise RemovalError('invalid CoK roster')
    sources = tuple(roster[16+410*i] for i in range(count))
    try:
        inventories = decode(inventory, sources)
    except ValueError as exc:
        raise RemovalError(str(exc)) from exc
    if len(timers) != 2572 or struct.unpack_from('<H', timers)[0] != 1:
        raise RemovalError('canonical timer state required')
    effect_count = struct.unpack_from('<H', timers, 2)[0]
    if effect_count > 256:
        raise RemovalError('too many effects')
    for i, source in enumerate(timers[4:12]):
        if source > 2 or (i >= count and source) or (i < count and sources[i] >= 128 and source):
            raise RemovalError('invalid effect source')
    effects = [[] for _ in sources]
    effect_order = []
    for offset in range(12, 12+10*effect_count, 10):
        owner = timers[offset]-1
        if not 0 <= owner < count or not timers[4+owner]:
            raise RemovalError('invalid effect owner')
        effect_order.append((owner, len(effects[owner])))
        effects[owner].append(timers[offset+1:offset+10])
    if len(item_table) != 2048 or not 0 <= target <= 255:
        raise RemovalError('complete definitions and byte target required')

    target_ordinal = struct.unpack_from('<H', gboc, 24)[0] if gboc is not None else None
    rng_state = [gbef_rng]
    candidate_roster = bytearray(roster)
    candidate_inventory, results, slots, freed = [], [], [], []
    item_types = bytearray(32)
    owned = bytearray(258)
    struct.pack_into('<H', owned, 0, 1)
    for owner, inv in enumerate(inventories):
        offset = 17+410*owner
        items = tuple(inv.records[i:i+63] for i in range(0, len(inv.records), 63))
        routed = gboc if owner+1 == target_ordinal else None
        if routed is not None:
            result = destroy(roster[offset:offset+409], items, effects[owner], item_table, target,
                             gboc=routed, gbef_rng=rng_state[-1], rng_out=rng_state)
        else:
            # Match every pre-existing caller's exact call shape (no
            # gboc/gbef_rng/rng_out keywords at all) so a destroy()
            # implementation that predates this parameter set (e.g. the
            # Unicorn-backed tools.cok_native_removal.destroy, whose
            # signature has no rng_out) still works unchanged when this
            # owner has no GBOC record routed to it.
            result = destroy(roster[offset:offset+409], items, effects[owner], item_table, target)
        results.append(dict(result.effects))
        candidate_roster[offset:offset+409] = result.body
        candidate_inventory.append(Inventory(inv.source, inv.present, inv.cloud,
                                             b''.join(raw for _, raw in result.items)))
        compact = {index: ordinal for ordinal, (index, _) in enumerate(result.items)}
        slots.append(tuple(None if index is None else compact[index] for index in result.slots))
        freed.extend((owner+1, kind, index) for kind, index in result.freed)
        for _, raw in result.items:
            item_types[raw[46] >> 3] |= 1 << (raw[46] & 7)
        for _, raw in result.effects:
            if raw[0]:
                owned[2+32*owner+(raw[0] >> 3)] |= 1 << (raw[0] & 7)

    candidate_timers = bytearray(2572)
    candidate_timers[:12] = timers[:12]
    live_count = 0
    for owner, index in effect_order:
        if index in results[owner]:
            offset = 12+10*live_count
            candidate_timers[offset:offset+10] = bytes([owner+1])+results[owner][index]
            live_count += 1
    struct.pack_into('<H', candidate_timers, 2, live_count)
    return PartyRemoved(bytes(candidate_roster), encode(candidate_inventory),
                        bytes(candidate_timers), bytes(owned), bytes(item_types),
                        tuple(slots), tuple(freed), rng_state[-1])
