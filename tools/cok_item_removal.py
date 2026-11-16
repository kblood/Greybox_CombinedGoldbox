"""Portable CoK removal model for the verified item/effect callback families.

Records retain their original indices during traversal, including freed nodes.
Output contains live records only; link and equipment pointers are zeroed and
represented by ordering/indices. This is a reference for staged DOS mutation,
not a replacement for the native inventory helper. Unmodeled applied callbacks
and the original missing-item error path reject the operation without output.
"""
from dataclasses import dataclass
import struct
import zlib

from tools.cok_item_abilities import strength, charisma
from tools.cok_equipment import recalculate
from tools.cok_rng import step as _rng_step


class RemovalError(ValueError):
    """An operation that cannot be published; inputs remain unchanged."""


# GBOC v1 effect-7 authorization at the cm_remove_effect boundary
# (native/src/cokremove.inc, 2026-09-09;
# docs/engine/research/cok-mutation-output-ownership.md). This is the
# narrower, single-owner contract this project actually wired natively this
# round -- NOT the still-unbuilt full GBMR v3 request/response contract that
# tools.cok_mutation_output models (its AUTHORIZED_OUTPUT_CALLBACKS stays the
# empty frozenset() on purpose: only this cm_remove_effect-boundary authority
# exists so far, and it is deliberately a distinct, separately-tested
# reference rather than a reuse of that module's validate()/apply(), which
# would still reject callback id 7).
GBOC_EFFECT7_HP_OFFSET = 407
GBOC_EFFECT7_STATUS_OFFSET = 392
GBOC_EFFECT7_ACTIVE_OFFSET = 393


def authorize_effect7(record, gbef_rng, body):
    """Python mirror of cokremove.inc's cm_authorize_output.

    Raises RemovalError on any rejection (matching native CF); nothing is
    mutated on a raise. Returns (body, gbef_rng) on acceptance -- unchanged
    body and rng_before for a validated write-flag-clear record, per
    E6:0xA7's `clamp(hp-damage, 0)` plus its status/death-transition writes
    and the folded rng_after for a validated write-flag-present one
    (single-owner scope: target_ordinal must be exactly 1).
    """
    if len(record) != 40 or record[:4] != b'GBOC':
        raise RemovalError('bad GBOC magic/length')
    version, length = struct.unpack_from('<HH', record, 4)
    if version != 1 or length != 40:
        raise RemovalError('bad GBOC version/length field')
    if zlib.crc32(record[:36]) != struct.unpack_from('<I', record, 36)[0]:
        raise RemovalError('GBOC checksum mismatch')
    if (record[11] != 0 or record[14:16] != bytes(2) or record[27] != 0
            or record[30:36] != bytes(6)):
        raise RemovalError('GBOC reserved bytes must be zero')
    rng_before, = struct.unpack_from('<I', record, 16)
    if rng_before != gbef_rng:
        raise RemovalError('GBOC rng-before does not match the paused state')
    write_flag = record[10]
    if write_flag not in (0, 1):
        raise RemovalError('GBOC write flag must be 0 or 1')
    draws, = struct.unpack_from('<H', record, 12)
    rng_after, = struct.unpack_from('<I', record, 20)
    target_ordinal, damage = struct.unpack_from('<HB', record, 24)
    queue_slot, = struct.unpack_from('<H', record, 28)
    if write_flag == 0:
        if draws or target_ordinal or damage or queue_slot or rng_after != rng_before:
            raise RemovalError('GBOC output fields must be zero when the write flag is clear')
        return bytes(body), rng_before
    callback_id, = struct.unpack_from('<H', record, 8)
    if callback_id != 7:
        raise RemovalError('only callback 7 is authorized at this boundary')
    if not 1 <= draws <= 0xFFFF:
        raise RemovalError('GBOC draws must be a positive word')
    expected = rng_before
    for _ in range(draws):
        expected = _rng_step(expected)
    if rng_after != expected:
        raise RemovalError('GBOC rng-after does not fold from rng-before by the declared draw count')
    if target_ordinal != 1:
        raise RemovalError('single-owner scope requires target_ordinal == 1')
    body = bytearray(body)
    # 2026-09-09 adversarial-review fix (mirrors native cokremove.inc's
    # cm_authorize_output): retail E6:0xA7 has two additional mechanisms
    # keyed on the PRIOR status byte that this arithmetic below does not
    # reproduce -- a second route to status 6 when remaining HP hits 0 and
    # prior status was already 1, and a post-hoc membership gate that forces
    # HP=0/active=0 whenever the resulting status is outside {0,1}, even for
    # a zero-damage call. Both were found by executing the retail binary
    # with a varied prior-status axis (every prior test/fixture held it
    # fixed at 0). Rather than reproduce that state machine unverified, this
    # narrows authorization to the one prior-status value the arithmetic
    # below IS proven correct for.
    if body[GBOC_EFFECT7_STATUS_OFFSET] != 0:
        raise RemovalError('GBOC output authorization requires prior status 0 (untested retail states)')
    hp = body[GBOC_EFFECT7_HP_OFFSET]
    if damage <= hp:
        remaining = hp-damage
        body[GBOC_EFFECT7_HP_OFFSET] = remaining
        if remaining == 0:
            body[GBOC_EFFECT7_STATUS_OFFSET] = 4
            body[GBOC_EFFECT7_ACTIVE_OFFSET] = 0
    else:
        overkill = damage-hp
        body[GBOC_EFFECT7_HP_OFFSET] = 0
        body[GBOC_EFFECT7_STATUS_OFFSET] = 5 if overkill <= 9 else 6
        body[GBOC_EFFECT7_ACTIVE_OFFSET] = 0
    return bytes(body), rng_after


@dataclass(frozen=True)
class Removed:
    body: bytes
    items: tuple[tuple[int, bytes], ...]
    effects: tuple[tuple[int, bytes], ...]
    slots: tuple[int | None, ...]
    freed: tuple[tuple[str, int], ...]


class _Chain:
    def __init__(self, records, link):
        self.records = [bytearray(r) for r in records]
        self.links = list(range(1, len(records))) + ([None] if records else [])
        self.head = 0 if records else None
        self.link = link

    def indices(self):
        current = self.head
        while current is not None:
            yield current
            current = self.links[current]

    def raw(self):
        return tuple(bytes(self.records[i]) for i in self.indices())

    def unlink(self, index):
        # E6:70 searches the current list. A second removal reports an error;
        # it does not free twice or silently accept an already-removed node.
        previous = None
        for current in self.indices():
            if current == index:
                if previous is None:
                    self.head = self.links[index]
                else:
                    self.links[previous] = self.links[index]
                self.links[index] = None
                return
            previous = current
        raise RemovalError('original missing-item error path')

    def result(self):
        result = []
        for index in self.indices():
            record = self.records[index][:]
            record[self.link:self.link+4] = bytes(4)
            result.append((index, bytes(record)))
        return tuple(result)


def destroy(body, items, effects, item_table, target, gboc=None, gbef_rng=0, rng_out=None):
    """Model one owner's DESTROY_ITEMS traversal, preserving nested deletion.

Applied effects 0Ch/0Eh/26h and 17h are implemented. Other unapplied effects
can be removed, but other applied callbacks raise RemovalError. A caller must
stage every owner before publishing any party/inventory/effect changes.

    gboc/gbef_rng/rng_out are additive and OFF by default (gboc=None), so
    every existing caller is unaffected: an applied kind-7 effect still
    raises RemovalError exactly as before. Passing a 40-byte GBOC v1 record
    as `gboc` (plus the paused `gbef_rng` state) routes kind-7 through
    authorize_effect7 instead, mirroring cokremove.inc's cm_remove_effect
    .damage branch calling cm_authorize_output (2026-09-09). If `rng_out` is
    a list, the final gbef_rng (unchanged from the input value unless a
    write-flag-present GBOC record was accepted) is appended to it -- this
    keeps the Removed dataclass's fields exactly as every other caller
    already expects.
    """
    if len(body) != 409 or any(len(r) != 63 for r in items) or any(len(r) != 9 for r in effects):
        raise RemovalError('complete CoK body, inventory and effect records required')
    if not 0 <= target <= 255:
        raise RemovalError('item type is a byte')
    body = bytes(body)
    inventory, active = _Chain(items, 42), _Chain(effects, 5)
    freed = []
    slots = ()

    def stats():
        nonlocal body, slots
        result = recalculate(body, inventory.raw(), item_table)
        body = result.body
        live = tuple(inventory.indices())
        slots = tuple(live[i] if i is not None else None for i in result.equipment.slots)

    def ability(model):
        nonlocal body
        body = model(body, inventory.raw(), active.raw())

    def unlink_item(index):
        inventory.unlink(index)
        freed.append(('item', index))

    def remove_effect(kind):
        nonlocal body, gbef_rng
        index = next((i for i in active.indices() if active.records[i][0] == kind), None)
        if index is None:
            return
        effect = active.records[index]
        if effect[4]:
            if kind == 0x17:
                conjured = next((i for i in inventory.indices()
                                 if inventory.records[i][46] == 6 and inventory.records[i][49] == 0x79), None)
                if conjured is not None:
                    unlink_item(conjured)
                stats()
            elif kind == 7:
                if gboc is None:
                    raise RemovalError(f'unmodeled applied effect {kind:02x}')
                body, gbef_rng = authorize_effect7(gboc, gbef_rng, body)
            elif kind not in (0x0C, 0x0E, 0x26):
                raise RemovalError(f'unmodeled applied effect {kind:02x}')
        active.unlink(index)
        freed.append(('effect', index))
        if kind == 0x0E:
            ability(charisma)
        elif kind in (0x0C, 0x26):
            ability(strength)

    current = inventory.head
    while current is not None:
        # The outer handler caches this before unready invokes any callbacks.
        following = inventory.links[current]
        record = inventory.records[current]
        if record[46] == target:
            if record[52] and not record[54]:
                record[52] = 0
                if record[62] > 127:
                    kind = record[62] & 127
                    if kind in (0, 2):
                        remove_effect(record[61])
                    elif kind in (3, 5):
                        ability(strength)
                    elif kind == 9:
                        remove_effect(0x17)
            unlink_item(current)
        current = following
    stats()
    normalized = bytearray(body)
    normalized[227:231] = bytes(4)
    normalized[323:379] = bytes(56)
    if rng_out is not None:
        rng_out.append(gbef_rng)
    return Removed(bytes(normalized), inventory.result(), active.result(), slots, tuple(freed))
