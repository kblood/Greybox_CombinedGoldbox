"""Queue-vs-direct: does anything stage effect 7's damage before the HP write?

`docs/engine/research/cok-item-removal-native-plan.md`'s 2026-09-08 continuation
located and dynamically confirmed the full consumer chain `0167AFh -> 0162E3h
(-> 14F24h at 0165F7h) -> 0150A8h (called at 016621h) -> E6:0xA7` (file
`038A7Dh`), the actual HP-write site. `docs/engine/research/
cok-mutation-output-ownership.md`'s "What remains before this is native" item 1
closed that RE prerequisite but explicitly left open whether a DAMAGE-queue
mechanism exists that a native GBMR v3 callback could append to, or whether
`038A7Dh`'s direct write is the only mechanism. This module answers that,
statically and dynamically, without authorizing any mutation callback
(`AUTHORIZED_OUTPUT_CALLBACKS` remains the empty `frozenset()`).

**Answer: no queue. Direct scalar read-and-forward only.**

Static half: the entire 42-byte instruction span between `call 0x14f24`
returning (file `0165FAh`) and `call 0x150a8` being reached (file `016621h`,
3-byte `call` ending at `016624h`) is pinned below. It contains exactly one
`les`, one flag compare+conditional skip, and eight `push`-family
instructions -- two of which are `mov al,[0x6b30]` (absolute `0x56B30`, DS
segment `0x5000`) immediately followed by `push ax`: a direct load of the
scalar 14F24h itself just wrote, forwarded unchanged. There is no write
instruction, no call to any other subroutine, and no loop in this span --
i.e. no room for an append, an index increment, or a watermark check.

Dynamic half: running the real `0150A8h -> E6:0xA7` chain twice in a row,
with identical inputs, touches the byte-for-byte IDENTICAL set of memory
addresses both times (`test_no_growing_state_across_repeated_calls`), while
the target's HP keeps decreasing cumulatively -- proving the routine has a
real, repeatable effect but leaves no advancing/growing state anywhere a
queue would need one (an append-based queue's write pointer would move to a
new slot on the second call). Restricting the same trace to each combat
participant's own 512-byte struct shows the ONLY byte ever written on either
struct is the documented HP field (`test_within_struct_writes_are_only_the_
documented_hp_field`) -- no "pending damage" byte lands anywhere else on
either struct. `test_write_set_equality_is_sensitive_to_real_code_path_
differences` proves this identical-set check is not vacuous: a damage value
with a different ASCII digit count measurably changes the transient stack
scratch the "compose combat message" text formatting uses, so the two
write-sets differ when the code path genuinely differs.

This module does not investigate the SEPARATE, unrelated native (clean-room)
"DAMAGE" mechanism that already exists in this project's own engine source
for ECL script opcode 0x2E (`native/src/ccecl.asm`'s `op_damage`, appending
20-byte records to `fx_script_events`, drained by `native/src/gbboot.asm`'s
`apply_effect_damage_roster`/`apply_damage_value_to_roster`). That IS a real,
append-based, multi-entry queue with its own watermark/acknowledgement
protocol -- but it is native-only code with no original-binary counterpart,
populated solely by the ECL VM's own opcode dispatch and drained entirely by
GBBOOT's own DOS file I/O; it has no relationship to the 14F24h/E6:0xA7 chain
this module traces, which lives entirely inside the original CoK executable's
overlay code. See `cok-mutation-output-ownership.md`'s updated design section
for that distinction and its implications for a GBMR v3 contract.
"""
from pathlib import Path
import struct

import pytest

pytest.importorskip('unicorn')
from unicorn import UC_HOOK_MEM_WRITE
from tools.cok_item_removal_oracle import Member, BODY_BASE, pointer
from tools.test_cok_effect7_target_provenance import held, machine, call_14f24, A, B
from tools.test_cok_effect7_damage_consumer import (
    call_150a8, set_combat_fields, read_combat_fields, HP_OFFSET,
)

DAMAGE_SCRATCH = 0x56B30

# File 0165FAh..016624h: everything between `call 0x14f24` (0165F7h, 3 bytes,
# ending at 0165FAh) returning and `call 0x150a8` (016621h, 3 bytes, ending
# at 016624h) completing. Captured from `Champions of Krynn/GAME.OVR` and
# cross-checked against `python tools/disasm_cok.py dis 0x1653c 0x180`.
CALLER_GLUE_SPAN = (0x0165FA, 0x016624)
CALLER_GLUE_BYTES = bytes.fromhex(
    'c47e102680bd890100741fff7616ff7614ff7612ff76108a46e9'
    '50a0306b50a0306b50b001500ee884ea'
)
# Exhaustive instruction accounting for the pinned span (offsets relative to
# 0x0165FA; lengths sum to the full 42 bytes with no remainder):
#   les di,[bp+0x10]        (3)  -- reload target far pointer
#   cmp es:[di+0x189],0     (6)  -- target's own active flag (ES-prefixed cmp,
#                                   ModRM reg field is CMP's /7, not a write).
#                                   CORRECTED 2026-09-09: this line previously
#                                   said "attacker active flag", self-
#                                   contradicting the line immediately above it
#                                   which already (correctly) calls [bp+0x10]
#                                   the TARGET far pointer -- it is the same
#                                   reloaded pointer being tested here, not a
#                                   different (attacker's) one. See
#                                   tools/test_cok_effect7_damage_consumer.py's
#                                   module docstring for the disassembly proof
#                                   (same [bp+0x10] pushed identically before
#                                   both the 14F24h call and this forward).
#   je 0x16624              (2)  -- skip the whole block when inactive
#   push [bp+0x16]          (3)  -- forwarded pointer arg (other struct hi)
#   push [bp+0x14]          (3)  -- forwarded pointer arg (other struct lo)
#   push [bp+0x12]          (3)  -- forwarded pointer arg (target struct hi)
#   push [bp+0x10]          (3)  -- forwarded pointer arg (target struct lo)
#   mov al,[bp-0x17]        (3)  -- message sub-type byte
#   push ax                 (1)
#   mov al,[0x6b30]         (3)  -- ABSOLUTE 0x56B30: read the scalar 14F24h
#   push ax                 (1)     just wrote (first of two copies)
#   mov al,[0x6b30]         (3)  -- same scalar, read again (second copy)
#   push ax                 (1)
#   mov al,1                (2)  -- mode word
#   push ax                 (1)
#   push cs                 (1)
#   call 0x150a8            (3)  -- the only call in this span
CALLER_GLUE_INSTRUCTION_LENGTHS = (3, 6, 2, 3, 3, 3, 3, 3, 1, 3, 1, 3, 1, 2, 1, 1, 3)


def _write_set(m, thunk):
    writes = []

    def rec(uc, access, addr, size, value, _):
        writes.append(addr)

    hook = m.uc.hook_add(UC_HOOK_MEM_WRITE, rec, begin=0, end=0x100000)
    thunk()
    m.uc.hook_del(hook)
    return set(writes)


def test_caller_glue_between_14f24_and_150a8_has_no_write_instructions(held):
    """Pin the exact bytes of the caller-side forwarding glue and show, by
    exhaustive instruction-length accounting, that it decodes to exactly 17
    instructions with zero remainder -- so there is no undisclosed byte in
    this span that could belong to a write, an enqueue call, or a loop.
    """
    retail, body, items, effects, id7 = held
    _, overlay, _ = retail
    lo, hi = CALLER_GLUE_SPAN
    span = overlay[lo:hi]
    assert len(span) == 42
    assert span == CALLER_GLUE_BYTES
    # `sum(CALLER_GLUE_INSTRUCTION_LENGTHS) == 42` used to stand here as the
    # sole check on this tuple. That is vacuous: CALLER_GLUE_INSTRUCTION_LENGTHS
    # is a hand-transcribed literal in this same file, so the assertion only
    # checks that a human's arithmetic on their own constant is self-consistent
    # -- it never asks whether the lengths correspond to real instruction
    # boundaries in CALLER_GLUE_BYTES. Verified vacuous 2026-09-09: replacing
    # the tuple with the bogus, boundary-blind `(21, 21)` (which also sums to
    # 42) left `sum(...) == 42` PASSING. Replaced with an independent capstone
    # (16-bit x86) disassembly of the pinned bytes, cross-checked against the
    # tuple AND against the mnemonics this module's own comment already names
    # for each instruction -- a check that fails the moment the lengths (or
    # the claimed mnemonics) stop matching a real disassembly of the span.
    import capstone
    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_16)
    insns = list(md.disasm(span, CALLER_GLUE_SPAN[0]))
    assert tuple(insn.size for insn in insns) == CALLER_GLUE_INSTRUCTION_LENGTHS
    assert sum(insn.size for insn in insns) == 42
    assert [insn.mnemonic for insn in insns] == [
        'les', 'cmp', 'je', 'push', 'push', 'push', 'push', 'mov', 'push',
        'mov', 'push', 'mov', 'push', 'mov', 'push', 'push', 'call',
    ]
    # The only two memory-read instructions targeting a fixed data address
    # (as opposed to a stack-relative [bp+N] argument) are the pair reading
    # DS:0x6B30 -- confirming the "forward a scalar" shape, not an indexed
    # array/queue access (which would need an additional index register load
    # and a non-constant effective address, neither present here).
    assert span.count(bytes.fromhex('a0306b')) == 2


@pytest.mark.parametrize('real_in_slot0', [False, True])
def test_no_growing_state_across_repeated_calls(held, real_in_slot0):
    """Run the real 0150A8h -> E6:0xA7 chain three times in a row on the same
    machine, same target/other/damage. An append-based queue (a pending-
    damage record list with an advancing write index, or a watermark that
    only grows) would necessarily touch a DIFFERENT address on the second and
    third call (the next slot / the advanced watermark cell). Direct-write-
    only, reusing the same scratch/stack frame each time, touches the
    IDENTICAL address set every time.
    """
    retail, body, items, effects, id7 = held
    real, bare = Member(body, items, effects), Member(body)
    slot0, slot1 = (real, bare) if real_in_slot0 else (bare, real)
    real_addr = A if real_in_slot0 else B
    bare_addr = B if real_in_slot0 else A

    m = machine(retail, slot0, slot1)
    set_combat_fields(m, bare_addr, hp=100, status=0, active=1)
    fired = call_14f24(m, ptr1=bare_addr, ptr2=real_addr)
    # `damage = m.uc.mem_read(DAMAGE_SCRATCH, 1)[0]; assert damage ==
    # fired['damage']` used to stand here. That is vacuous with respect to
    # this module's subject: `fired['damage']` IS `m.uc.mem_read(DAMAGE_SCRATCH,
    # 1)[0]`, captured inside call_14f24 moments earlier with ZERO Unicorn
    # instructions executed in between the two reads -- no retail byte, no
    # parametrization, no combat-field input can ever make two reads of the
    # identical address at the identical point disagree. Verified 2026-09-09:
    # the only way to flip this comparison is to rewrite call_14f24's own
    # return expression (e.g. to a hardcoded literal) -- i.e. it can only ever
    # catch a bug in the test's own plumbing, never anything about the real
    # 14F24h/0150A8h/E6:A7 chain. Replaced with a fallible check on the actual
    # claim this test makes ("no queue"): DAMAGE_SCRATCH must still hold this
    # SAME byte after the three repeated direct 0150A8h calls below, proving
    # the forwarding scratch is read-only from 0150A8h's perspective and is
    # never cleared/advanced the way a dequeue would leave it.
    damage = fired['damage']
    assert damage > 0

    def call_once():
        call_150a8(m, target=bare_addr, other=real_addr, damage=damage)

    set1 = _write_set(m, call_once)
    hp1 = read_combat_fields(m, bare_addr)
    set2 = _write_set(m, call_once)
    hp2 = read_combat_fields(m, bare_addr)
    set3 = _write_set(m, call_once)
    hp3 = read_combat_fields(m, bare_addr)

    # The routine keeps having a real, cumulative effect on HP...
    assert hp1[0] == 100 - damage
    assert hp2[0] == 100 - 2 * damage
    assert hp3[0] == 100 - 3 * damage
    # ...while touching the exact same set of addresses every single time...
    assert set1 == set2 == set3
    assert len(set1) > 0
    # ...and never touching or clearing the forwarding scratch itself.
    assert m.uc.mem_read(DAMAGE_SCRATCH, 1)[0] == damage


@pytest.mark.parametrize('real_in_slot0', [False, True])
def test_within_struct_writes_are_only_the_documented_hp_field(held, real_in_slot0):
    """Neither combat participant's 512-byte struct is written anywhere but
    the documented HP field during the 0150A8h -> E6:0xA7 chain: no
    "pending damage" byte lands on either struct elsewhere (not the target's,
    not the other participant's).
    """
    retail, body, items, effects, id7 = held
    real, bare = Member(body, items, effects), Member(body)
    slot0, slot1 = (real, bare) if real_in_slot0 else (bare, real)
    real_addr = A if real_in_slot0 else B
    bare_addr = B if real_in_slot0 else A

    m = machine(retail, slot0, slot1)
    set_combat_fields(m, bare_addr, hp=50, status=0, active=1)
    fired = call_14f24(m, ptr1=bare_addr, ptr2=real_addr)
    damage = m.uc.mem_read(DAMAGE_SCRATCH, 1)[0]

    writes = _write_set(m, lambda: call_150a8(
        m, target=bare_addr, other=real_addr, damage=damage))
    struct_hits = {a for a in writes if A <= a < A + 512 or B <= a < B + 512}
    assert struct_hits == {bare_addr + HP_OFFSET}


def test_write_set_equality_is_sensitive_to_real_code_path_differences(held):
    """Mutation-style control for test_no_growing_state_across_repeated_calls:
    proves the identical-write-set check is not vacuously always true.
    Composing a message for a 2-digit damage value uses measurably more
    transient stack scratch than a 1-digit value (ASCII digit-count in the
    "compose combat message" text formatting), so the two write-sets must
    differ -- if they never could, the equality assertion above would prove
    nothing.
    """
    retail, body, items, effects, id7 = held
    real, bare = Member(body, items, effects), Member(body)

    def trace(damage):
        m = machine(retail, bare, real)
        set_combat_fields(m, A, hp=50, status=0, active=1)
        return _write_set(m, lambda: call_150a8(m, target=A, other=B, damage=damage))

    set_1digit = trace(6)
    set_2digit = trace(40)
    assert set_1digit != set_2digit
