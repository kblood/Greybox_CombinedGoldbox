"""Clean-room fixed-gift action derivation; no files or publication authority.

The native coordinator separately admits origin/source/resource and producer
records. These rules derive complete private P1/offer/ledger postimages.
"""
from dataclasses import dataclass, replace
import struct

from tools.secret_reward_names import format_pending, party_has_effect5
from tools.secret_reward_party import award_fixed_gift, take_item, transfer_gems, recalculate_secret
from tools.secret_roster import encode


@dataclass(frozen=True)
class OfferItem:
    index: int
    record: bytes
    status: int = 0
    recipient: int = 0
    ordinal: int = 0
    formatted: bool = False
    stf_offset: int = 65535


@dataclass(frozen=True)
class Transfer:
    kind: int
    recipient: int
    item: int
    amount: int


@dataclass(frozen=True)
class Snapshot:
    party: object
    items: tuple[OfferItem, ...]
    phase: int = 2
    selection_flags: int = 0
    selected: int = 0
    pools: tuple[int, ...] = (0, 0, 0, 0, 0, 20, 0)
    gems: tuple[int, ...] = (0,) * 6
    awards: tuple[int, ...] = (0,) * 6
    flags: int = 0
    transfers: tuple[Transfer, ...] = ()
    epochs: tuple[tuple[int, ...], ...] = ((),)
    # Source-defined after R; there is no invented pre-first-R global input.
    ready_weight: int | None = None
    movement_global: int | None = None

    @property
    def pending(self):
        return tuple(item for item in self.items if item.status == 0)

    def state_bytes(self):
        data = bytearray(160)
        data[:4] = b"GBRW"
        struct.pack_into("<6H", data, 4, 1, 160, self.phase, len(self.party.heroes),
                         self.selection_flags, self.selected)
        masks = tuple(sum(1 << item.index for item in self.items if item.status == status)
                      for status in (0, 1, 2))
        formatted = sum(1 << item.index for item in self.items if item.formatted)
        struct.pack_into("<4H", data, 16, *masks, formatted)
        struct.pack_into("<I7I", data, 28, 15000, *self.pools)
        struct.pack_into("<6H", data, 60, *self.gems)
        struct.pack_into("<6I", data, 72, *self.awards)
        acquired = sum(item.status == 1 for item in self.items)
        struct.pack_into("<4H", data, 96, acquired, len(self.transfers), 65535,
                         5 if self.phase == 8 else 65535)
        struct.pack_into("<2I", data, 104, self.pools[5] if self.phase == 8 else 0, self.flags)
        actors = sum(1 << (op - 2) for op in self.epochs[-1] if op >= 2)
        struct.pack_into("<H", data, 112, actors)
        return bytes(data)

    def item_bytes(self):
        data = bytearray(960)
        for item in self.items:
            offset = item.index * 80
            struct.pack_into("<HBB4H", data, offset, item.index, item.status, item.recipient,
                             item.ordinal, int(item.formatted), item.stf_offset, 0)
            data[offset + 12:offset + 79] = item.record
        return bytes(data)

    def ledger_bytes(self):
        data = bytearray(1056)
        data[:4] = b"GBRL"
        struct.pack_into("<6H", data, 4, 1, 16, len(self.transfers), 32, len(self.epochs), 0)
        for index, transfer in enumerate(self.transfers):
            struct.pack_into("<4H2I", data, 16 + index * 16, transfer.kind, transfer.recipient,
                             transfer.item, 0, transfer.amount, index + 1)
        for index, epoch in enumerate(self.epochs):
            offset = 528 + index * 16
            data[offset:offset + 2] = bytes((index, len(epoch)))
            data[offset + 2:offset + 2 + len(epoch)] = bytes(epoch)
        return bytes(data)


def fixed_offer(party, member, *, selection_flags=0, selected=0):
    """Caller has byte-exact admitted member18, never a fabricated resource."""
    encode(party)
    if len(member) != 756 or selection_flags not in (0, 1) or not 0 <= selected <= len(party.heroes):
        raise ValueError("bounded admitted offer/selection required")
    if bool(selection_flags) != bool(selected):
        raise ValueError("selection identity disagreement")
    rows = tuple(OfferItem(index, member[index * 63:(index + 1) * 63] + bytes(4)) for index in range(12))
    return Snapshot(party, rows, selection_flags=selection_flags, selected=selected)


def operator(state, op, bank1_6e4=0):
    if op == 1:
        star = party_has_effect5(state.party.heroes)
        items = tuple(replace(item, record=format_pending(item.record, star), formatted=True)
                      if item.status == 0 else item for item in state.items)
        state = replace(state, items=items)
    elif 2 <= op <= len(state.party.heroes) + 1:
        actor = op - 2
        hero = state.party.heroes[actor]
        calculated = recalculate_secret(hero.body, hero.stf, hero.sfx, state.party.catalogue, bank1_6e4)
        heroes = list(state.party.heroes)
        heroes[actor] = replace(hero, body=calculated.body)
        state = replace(state, party=replace(state.party, heroes=tuple(heroes)),
                        ready_weight=calculated.ready_weight, movement_global=calculated.movement_global)
    else:
        raise ValueError("unknown/unavailable normalization operator")
    epoch = tuple(old for old in state.epochs[-1] if old != op) + (op,)
    return replace(state, epochs=state.epochs[:-1] + (epoch,))


def record_transfer(state, transfer):
    if len(state.transfers) >= 32:
        raise ValueError("finite fixed-offer transfer bound exceeded")
    return replace(state, transfers=state.transfers + (transfer,), epochs=state.epochs + ((),))


def action(state, kind, *, recipient=0, item=65535, value=0, suppression=0, bank1_6e4=0):
    """Derive one already-bound action; result1 accepted/2 zero/3 refused.

    It grants no file/recovery/producer authority. UI highlight is never stored.
    """
    if (type(kind) is not int or type(recipient) is not int or type(item) is not int
            or type(value) is not int or value < 0 or kind in (0, 1, 2, 3, 17, 19)):
        raise ValueError("unknown/internal action or malformed scalar")
    if kind not in (6, 7, 10, 12) and recipient != 0:
        raise ValueError("unused recipient")
    if kind != 10 and item != 65535 or kind != 12 and value != 0:
        raise ValueError("unused item/value")
    phase = state.phase
    pending, money = bool(state.pending), bool(any(state.pools))
    if kind == 4 and phase == 2:
        party, xp = award_fixed_gift(state.party, suppression)
        awards = xp.awards + (0,) * (6 - len(xp.awards))
        # Original8230/827E runs R on every surviving actor BEFORE RESULT.
        # This mandatory source prefix is outside optional epoch0 history.
        heroes = []
        for hero in party.heroes:
            calculated = recalculate_secret(hero.body, hero.stf, hero.sfx,
                                            party.catalogue, bank1_6e4)
            heroes.append(replace(hero, body=calculated.body))
        party = replace(party, heroes=tuple(heroes))
        return replace(state, party=party, phase=3, selection_flags=1, selected=1, awards=awards, flags=3,
                       ready_weight=calculated.ready_weight, movement_global=calculated.movement_global), 1
    if kind == 5 and phase == 3:
        return replace(state, phase=4), 1
    if kind in (6, 7) and phase in (4, 5):
        selected = (state.selected - 1 + (-1 if kind == 6 else 1)) % len(state.party.heroes) + 1
        if recipient != selected:
            raise ValueError("recipient does not equal source cycle")
        return replace(state, selected=selected), 1
    if kind == 20 and phase == 4:
        target = 5 if pending and money else 6 if pending else 7 if money else 4
        state = replace(state, phase=target)
        return (operator(state, 1, bank1_6e4) if target == 6 else state), 1
    if kind == 8 and phase == 5 and pending:
        return operator(replace(state, phase=6), 1, bank1_6e4), 1
    if kind == 9 and phase == 6:
        return replace(state, phase=5 if pending and money else 4), 1
    if kind == 10 and phase == 6:
        if recipient != state.selected or not 0 <= item < 12 or state.items[item].status != 0:
            raise ValueError("foreign recipient or nonpending item")
        offered = state.items[item]
        prior_length = len(state.party.heroes[recipient - 1].stf)
        transferred = take_item(state.party, recipient - 1, offered.record, bank1_6e4)
        state = replace(state, party=transferred.party, ready_weight=transferred.ready_weight,
                        movement_global=transferred.movement_global)
        if not transferred.accepted:
            return operator(operator(state, recipient + 1, bank1_6e4), 1, bank1_6e4), 3
        ordinal = 1 + sum(row.status == 1 for row in state.items)
        rows = list(state.items)
        rows[item] = replace(offered, status=1, recipient=recipient, ordinal=ordinal,
                             stf_offset=prior_length, record=offered.record[:42] + bytes(4) + offered.record[46:])
        state = record_transfer(replace(state, items=tuple(rows)), Transfer(1, recipient, item, 1))
        if state.pending:
            return operator(replace(state, phase=6), 1, bank1_6e4), 1
        return replace(state, phase=4), 1
    if kind == 11 and phase == 5 and money:
        return replace(state, phase=7), 1
    if kind == 23 and phase == 7 and state.pools[5] > 0:
        return replace(state, phase=8), 1
    if kind == 12 and phase == 8:
        if recipient != state.selected or value > state.pools[5]:
            raise ValueError("foreign recipient or amount outside bound editor result")
        transfer = transfer_gems(state.party, state.pools, recipient - 1, value)
        if transfer.refused:
            return replace(state, phase=7), 3
        state = replace(state, party=transfer.party, pools=transfer.pools)
        if transfer.transferred:
            totals = list(state.gems)
            totals[recipient - 1] += transfer.transferred
            state = record_transfer(replace(state, gems=tuple(totals)), Transfer(2, recipient, 65535, transfer.transferred))
        return replace(state, phase=7 if state.pools[5] else 4), 1 if transfer.transferred else 2
    if kind == 13 and phase == 8:
        return replace(state, phase=7), 2
    if kind == 14 and phase == 4:
        return replace(state, phase=9 if pending or money else 10), 1
    if kind == 15 and phase == 9:
        return replace(state, phase=4), 1
    if kind == 16 and phase == 9:
        rows = tuple(replace(row, status=2) if row.status == 0 else row for row in state.items)
        return replace(state, phase=10, items=rows, flags=state.flags | 4), 1
    if kind == 18 and phase == 10:
        return replace(state, phase=11), 1
    if kind == 21 and phase == 5:
        return replace(state, phase=4), 1
    if kind == 22 and phase == 7:
        return replace(state, phase=5 if pending and money else 4), 1
    raise ValueError("action not admitted in current phase")
