"""Strict source-reachable compact reward history, not arithmetic-only replay."""
from dataclasses import replace
import struct

from tools.cok_equipment import strength_index, weight_allowance
from tools.secret_reward_state import Snapshot, Transfer, action, operator
from tools.secret_roster import encode


def refused_normalized(body, item):
    """Exact source count/word-weight refusal; no allocation or fallback."""
    weight = struct.unpack_from("<H", item, 55)[0]
    if item[57]: weight = (weight * item[57]) & 65535
    total = (struct.unpack_from("<H", body, 411)[0] + weight) & 65535
    capacity = 1500 + weight_allowance(strength_index(body[17], body[28]))
    return body[352] > 15 or total > capacity


def replay(initial, ledger, phase, selected, flags, *, suppression=0, bank1_6e4=0):
    """Reconstruct all source writes, then admit quota-free terminal navigation.

    The caller separately admits the exact origin/member/input and compares
    full P1/state/items/ledger. Current pending is derived at EACH epoch before
    later acquisitions and terminal No, never taken from a claimed final mask.
    """
    if len(ledger) != 1056 or ledger[:4] != b"GBRL":
        raise ValueError("invalid ledger framing")
    version, header, count, capacity, epochs, reserved = struct.unpack_from("<6H", ledger, 4)
    if (version, header, capacity, epochs, reserved) != (1, 16, 32, count + 1, 0) or count > 32:
        raise ValueError("invalid ledger counts")
    if ledger[16 + 16 * count:528] != bytes(512 - 16 * count):
        raise ValueError("nonzero unused transfers")
    if ledger[528 + 16 * epochs:] != bytes(16 * (33 - epochs)):
        raise ValueError("nonzero unused epochs")
    if initial.phase != 2 or initial.transfers or initial.epochs != ((),):
        raise ValueError("replay requires exact pre-AWARD baseline")
    state = action(initial, 4, suppression=suppression, bank1_6e4=bank1_6e4)[0]
    for epoch_index in range(epochs):
        row = ledger[528 + 16 * epoch_index:544 + 16 * epoch_index]
        n = row[1]
        ids = tuple(row[2:2 + n])
        if (row[0] != epoch_index or n > 7 or row[2 + n:] != bytes(14 - n)
                or len(set(ids)) != n or any(not 1 <= op <= len(state.party.heroes) + 1 for op in ids)):
            raise ValueError("invalid ordered epoch")
        if ids and (not state.pending or ids[-1] != 1):
            raise ValueError("unreachable epoch without pending/final F")
        for op in ids:
            state = operator(state, op, bank1_6e4)
            if op >= 2 and not any(refused_normalized(state.party.heroes[op - 2].body, item.record)
                                   for item in state.pending):
                raise ValueError("optional R has no source refusal witness")
        if state.epochs[-1] != ids:
            raise ValueError("mandatory post-transfer F was omitted")
        if epoch_index == count:
            break
        kind, recipient, item, spare, amount, ordinal = struct.unpack_from("<4H2I", ledger, 16 + 16 * epoch_index)
        if spare or ordinal != epoch_index + 1 or not 1 <= recipient <= len(state.party.heroes):
            raise ValueError("invalid transfer identity")
        state = replace(state, selected=recipient)
        if kind == 1:
            if amount != 1 or not ids or ids[-1] != 1 or not 0 <= item < 12:
                raise ValueError("item transfer without its source ITEMS epoch")
            state = replace(state, phase=6)
            state, result = action(state, 10, recipient=recipient, item=item, bank1_6e4=bank1_6e4)
        elif kind == 2:
            if item != 65535 or not 1 <= amount <= state.pools[5]:
                raise ValueError("invalid positive Gems transfer")
            state = replace(state, phase=8)
            state, result = action(state, 12, recipient=recipient, value=amount, bank1_6e4=bank1_6e4)
        else:
            raise ValueError("unknown transfer kind")
        if result != 1:
            raise ValueError("recorded successful transfer was source-refused")
    if state.ledger_bytes() != ledger:
        raise ValueError("ledger does not equal exact source-derived history")
    pending, money = bool(state.pending), bool(state.pools[5])
    if type(phase) is not int or not 3 <= phase <= 11 or not 1 <= selected <= len(state.party.heroes):
        raise ValueError("unreachable current phase/selection")
    if flags not in (3, 7):
        raise ValueError("invalid post-AWARD flags")
    if phase == 3 and (count or state.epochs[0] or selected != 1):
        raise ValueError("RESULT must be the untouched mandatory prefix")
    if phase == 5 and not (pending and money):
        raise ValueError("single-category TAKE is unreachable")
    if phase == 6 and not (pending and state.epochs[-1] and state.epochs[-1][-1] == 1):
        raise ValueError("ITEMS requires current formatted pending list")
    if phase in (7, 8) and not money or phase == 9 and not (pending or money):
        raise ValueError("resource-empty money/confirmation phase")
    state = replace(state, selected=selected)
    if flags & 4:
        if phase not in (10, 11) or not (pending or money):
            raise ValueError("unreachable No after complete exhaustion")
        state = action(replace(state, phase=9), 16)[0]
    elif phase in (10, 11) and (pending or money):
        raise ValueError("unfinished resources without source No")
    state = replace(state, phase=phase)
    encode(state.party)
    return state


def admit_images(initial, claimed, *, suppression=0, bank1_6e4=0):
    derived = replay(initial, claimed.ledger_bytes(), claimed.phase, claimed.selected, claimed.flags,
                     suppression=suppression, bank1_6e4=bank1_6e4)
    if (encode(derived.party), derived.state_bytes(), derived.item_bytes(), derived.ledger_bytes()) != (
            encode(claimed.party), claimed.state_bytes(), claimed.item_bytes(), claimed.ledger_bytes()):
        raise ValueError("complete reward images differ from source replay")
    return derived
