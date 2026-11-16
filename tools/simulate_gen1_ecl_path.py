#!/usr/bin/env python3
"""Concretely simulate a decoded Gen1 ECL control-flow path for one *given* host-memory
state, reusing `gen1_ecl_encounter_scan.decode_one`/`successors` unchanged.

`tools/map_gateway_newgame_route.py`'s static BFS (`scan_block_for_newecl`) deliberately
treats every dynamic (host-memory) `COMPARE` as fully nondeterministic
(`ALL_COMPARE_OUTCOMES`) so it can prove *reachability* without guessing a runtime value.
That is correct for the reachability question, but it cannot answer a narrower, equally
important one: for a *specific* candidate value at a dynamic host-memory location, does the
path actually reach the target `NEWECL`, or does it diverge somewhere else? Answering that
by hand (reading printed instruction tables) is exactly the kind of "raw opcode-byte
reading" this project distrusts -- this module answers it by literally walking
`decode_one`/`successors` with a concrete `host_state: dict[int, int]` substituted for every
dynamic operand, so `COMPARE`'s outcome is computed for real (not enumerated) and `SAVE`
writes are applied to a running copy of `host_state` (so later `COMPARE`s against a location
a script just wrote see the updated value, not the caller-supplied default).

Used by `docs/engine/research/gateway-newgame-route.md`'s guard-value round (2026-07-17) to
prove, independent of any DOSBox-X trace, which of Hop 1's two flagged dynamic guards
(`[0x7ED5]!=0`, `[0xC04D]!=3`) actually gates reachability of `NEWECL 21` and which one
merely selects between two cosmetic `SAVE` targets that both fall through to the same
unconditional continuation.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import goldbox_corpus
import gen1_ecl_encounter_scan as ecl

REPO_ROOT = goldbox_corpus.REPO_ROOT

# Opcodes this walker updates host_state for / resolves compare outcomes for. Every other
# opcode is handled generically by `ecl.successors` (usually plain fallthrough), matching
# `scan_block_for_newecl`'s own approach of not special-casing unrelated opcodes.
COMPARE_OPCODE = 0x03
SAVE_OPCODE = 0x09
EXIT_OPCODE = 0x00
NEWECL_OPCODE = 0x20
# Opcodes whose outcome this walker cannot resolve concretely (word-count/array ops etc.);
# if control flow reaches one of these while still ambiguous, the walk stops rather than
# silently guessing -- consistent with the project's "UNLOCATED beats invention" ethic.
UNRESOLVED_COMPARE_LIKE_OPCODES = (0x14, 0x1D, 0x2F, 0x30, 0x3F)


def _operand_value(operand: ecl.Operand, host_state: dict[int, int]) -> int:
    """Resolve one decoded operand to a concrete integer under `host_state`.

    `code == 0` is an immediate (the word itself). Any other code is a dynamic host-memory
    reference; `host_state` supplies its current value, defaulting to 0 for any location the
    caller did not seed (matching this project's existing convention -- see
    `gateway-newgame-route.md`'s own BFS, which never assumes a nonzero default either).
    """
    if operand.code == 0:
        return operand.word
    return host_state.get(operand.word, 0)


def simulate(
    raw: bytes,
    address_addend: int,
    start_offset: int,
    host_state: dict[int, int],
    max_steps: int = 4000,
) -> dict[str, Any]:
    """Walk one concrete execution path from `start_offset` to a terminal state.

    Terminal states: `NEWECL` (target found), `EXIT`, a dead end (`successors` returns
    nothing), an opcode this walker cannot resolve concretely, or the step budget.
    `host_state` is copied on entry and never mutated in the caller's dict.
    """
    state = dict(host_state)
    stack: tuple[int, ...] = ()
    offset = start_offset
    compare_outcomes: tuple[int, ...] = ecl.ALL_COMPARE_OUTCOMES
    trace: list[dict[str, Any]] = []

    for _ in range(max_steps):
        ins = ecl.decode_one(raw, offset)
        if ins is None:
            return {"status": "decode-fail", "offset": offset, "trace": trace}
        vaddr = ecl.offset_to_vaddr(offset, address_addend)
        trace.append({"vaddr": vaddr, "opcode": ins.opcode, "mnemonic": ins.mnemonic})

        if ins.opcode == EXIT_OPCODE:
            return {"status": "exit", "vaddr": vaddr, "trace": trace, "host_state": dict(state)}
        if ins.opcode == NEWECL_OPCODE:
            target = ins.args[0].word if ins.args and ins.args[0].code == 0 else None
            return {
                "status": "newecl",
                "vaddr": vaddr,
                "target_block": target,
                "target_block_dynamic": ins.args[0].code != 0 if ins.args else None,
                "trace": trace,
                "host_state": dict(state),
            }

        if ins.opcode == SAVE_OPCODE and len(ins.args) >= 2:
            src, dst = ins.args[0], ins.args[-1]
            if dst.code != 0:  # dst.code == 1 in every observed SAVE; guard anyway
                state[dst.word] = _operand_value(src, state)

        if ins.opcode == COMPARE_OPCODE and len(ins.args) >= 2:
            left_v = _operand_value(ins.args[0], state)
            right_v = _operand_value(ins.args[1], state)
            compare_outcomes = ((left_v > right_v) - (left_v < right_v),)
        elif ins.opcode in UNRESOLVED_COMPARE_LIKE_OPCODES:
            return {"status": "unresolved-opcode", "vaddr": vaddr, "opcode": ins.opcode, "trace": trace}

        succs = ecl.successors(raw, ins, stack, address_addend, compare_outcomes)
        if not succs:
            return {"status": "dead-end", "vaddr": vaddr, "trace": trace, "host_state": dict(state)}
        if len(succs) != 1:
            return {"status": "ambiguous", "vaddr": vaddr, "successor_count": len(succs), "trace": trace}
        offset, stack, _decision, compare_outcomes = succs[0]

    return {"status": "step-limit", "trace": trace}


def load_ecl2_block1(profile_id: str = "gateway-to-the-savage-frontier") -> bytes:
    inventory = goldbox_corpus.binary_inventory.inventory(
        goldbox_corpus.inventory_roots([]), recursive=False, max_depth=3, include_unprofiled=False
    )
    routes = goldbox_corpus.load_routes()
    install = goldbox_corpus.choose_install(inventory, profile_id, routes.get(profile_id))
    if install is None:
        raise SystemExit(f"install not detected for profile {profile_id!r}")
    files = goldbox_corpus.file_index(install)
    blocks = {b["block_id"]: b for b in goldbox_corpus.read_dax_blocks(files["ECL2.DAX"])}
    return blocks[1]["raw"]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host-state", type=str, default="{}", help='JSON object, e.g. \'{"32469": 1}\'')
    parser.add_argument("--start-vaddr", type=lambda s: int(s, 0), default=0x84D3)
    parser.add_argument("--profile", default="gateway-to-the-savage-frontier")
    args = parser.parse_args()
    raw = load_ecl2_block1(args.profile)
    host_state = {int(k): int(v) for k, v in json.loads(args.host_state).items()}
    start_offset = ecl.vaddr_to_offset(args.start_vaddr, ecl.DEFAULT_ADDRESS_ADDEND)
    result = simulate(raw, ecl.DEFAULT_ADDRESS_ADDEND, start_offset, host_state)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
