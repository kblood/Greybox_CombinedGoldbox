"""Opt-in bounded CoK roster evidence using the pinned Gen1 decoder and CFG edges."""
from __future__ import annotations

from collections import Counter, deque
from hashlib import sha256
import json

import gen1_ecl_encounter_scan as ecl


MAX_STATES = 50_000
MAX_CALL_DEPTH = 24
MAX_ROSTER_GROUPS = 16
WITNESS_TAIL = 12
LIMITS = {"statesPerBlock": MAX_STATES, "callDepth": MAX_CALL_DEPTH,
          "rosterGroups": MAX_ROSTER_GROUPS, "witnessTail": WITNESS_TAIL}
PROFILE = "champions-of-krynn"


def roster_id(block_sha, offset, roster):
    payload = json.dumps([block_sha, offset, roster], separators=(",", ":")).encode()
    return sha256(payload).hexdigest()


def compare_after(ins, outcomes):
    if ins.opcode == 0x03:
        left, right = ins.args
        if left.code == right.code == 0:
            return ((left.word > right.word) - (left.word < right.word),)
        return ecl.ALL_COMPARE_OUTCOMES
    if ins.opcode in (0x14, 0x1D, 0x2F, 0x30, 0x3F):
        return ecl.ALL_COMPARE_OUTCOMES
    return outcomes


def scan_block_variants(raw, *, max_states=MAX_STATES):
    """Retain one bounded witness for each physical-site, ordered-roster, entry tuple."""
    if not 0 <= max_states <= MAX_STATES:
        raise ValueError("state budget exceeds the reviewed bound")
    addend = ecl.PROFILE_ADDRESS_ADDENDS.get(PROFILE, ecl.DEFAULT_ADDRESS_ADDEND)
    words, opcodes = ecl.word_sets_for_profile(PROFILE), ecl.opcodes_for_profile(PROFILE)
    block_sha = sha256(raw).hexdigest()
    queue = deque()
    seen = set()
    frontiers = Counter()
    sites = {}

    def schedule(entry, offset, roster, stack, outcomes, length, tail):
        key = (entry, offset, roster, stack, outcomes)
        if key not in seen:
            seen.add(key)
            queue.append((key, length, tail))

    def issue(reason, entry, offset, target=None):
        frontiers[(reason, entry, offset, target)] += 1

    if len(raw) < ecl.ECL_HEADER_LEN or raw[:2] != b"\x88\x13":
        issue("invalid-header", "", 0)
    else:
        entries = dict(ecl.header_entries(raw, addend))
        for slot, name in enumerate(ecl.ENTRY_NAMES):
            if name in entries:
                schedule(name, entries[name], (), (), ecl.ALL_COMPARE_OUTCOMES, 0, ())
            else:
                issue("invalid-header-entry", name, 2 + slot * 4)

    explored = 0
    while queue and explored < max_states:
        (entry, offset, roster, stack, outcomes), length, tail = queue.popleft()
        explored += 1
        ins = ecl.decode_one(raw, offset, words, opcodes)
        if ins is None:
            issue("decode-failure", entry, offset)
            continue
        length += 1
        tail = (*tail, offset)[-WITNESS_TAIL:]
        if ins.opcode == 0x24:
            variants = sites.setdefault(offset, {})
            members = variants.setdefault(roster, {})
            members.setdefault(entry, {"instructionCount": length, "offsetTail": list(tail),
                                       "truncated": length > len(tail)})
        if ins.opcode in (0x1C, 0x24):
            roster = ()
        elif ins.opcode == 0x0B:
            if len(roster) == MAX_ROSTER_GROUPS:
                issue("roster-limit", entry, offset)
                continue
            roster += (tuple((operand.code, operand.word) for operand in ins.args[:3]),)

        outcomes = compare_after(ins, outcomes)
        if ins.opcode in (0x01, 0x02) and ecl.target_offset(ins.args[0], addend) is None:
            issue("unresolved-control-target", entry, offset)
        elif ins.opcode in (0x25, 0x26):
            for operand in ins.args[2:2 + ins.args[1].word]:
                if ecl.target_offset(operand, addend) is None:
                    issue("unresolved-control-target", entry, offset)
        elif 0x16 <= ins.opcode <= 0x1B:
            guarded = offset + ins.size
            if any(not ecl.condition_holds(ins.opcode, value) for value in outcomes):
                if ecl.decode_one(raw, guarded, words, opcodes) is None:
                    issue("undecodable-conditional-skip", entry, offset, guarded)

        for target, next_stack, _, next_outcomes in ecl.successors(raw, ins, stack, addend, outcomes, words, opcodes):
            if not ecl.ECL_HEADER_LEN <= target < len(raw):
                issue("nonlocal-edge", entry, offset, target)
            elif len(next_stack) > MAX_CALL_DEPTH:
                issue("call-depth-limit", entry, offset, target)
            else:
                schedule(entry, target, roster, next_stack, next_outcomes, length, tail)

    for (entry, offset, *_), _, _ in queue:
        issue("state-budget", entry, offset)
    return {
        "exploredStates": explored,
        "frontiers": [{"reason": reason, "entry": entry, "offset": offset, "target": target, "events": count}
                      for (reason, entry, offset, target), count in sorted(
                          frontiers.items(), key=lambda item: (*item[0][:3], item[0][3] if item[0][3] is not None else -1))],
        "sites": [{"offset": offset, "variants": [
            {"id": roster_id(block_sha, offset, roster),
             "roster": [[list(operand) for operand in group] for group in roster],
             "entries": dict(sorted(entries.items()))}
            for roster, entries in sorted(variants.items())]}
            for offset, variants in sorted(sites.items())],
    }
