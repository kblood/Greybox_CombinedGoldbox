"""Original 14F24h's caller/consumer: located and dynamically verified.

`docs/engine/research/cok-item-removal-native-plan.md` ("Effect-7 target
provenance and output ownership", 2026-09-08) and
`tools/test_cok_effect7_target_provenance.py` (21 tests) established that
14F24h computes a scaled damage byte into DS:56B30 but never writes either
candidate target's HP field itself, leaving "its own caller, not yet
located" as the open item both that doc and
`docs/engine/research/cok-mutation-output-ownership.md`'s "What remains
before this is native" item 1 name explicitly.

This module locates that caller chain by static disassembly and confirms it
dynamically, reusing the provenance module's own METHOD to do so: not by
reading the disassembly and trusting it, but by executing the real routines
with disagreeing inputs.

CORRECTED 2026-09-09 (adversarial review found misattributed prose in this
docstring at three sites; this is the first). The paragraph above used to
read: "...the same way the provenance module confirmed 14F24h's own
behaviour: not by reading the disassembly and trusting it, but by executing
the real routines with disagreeing inputs and observing the DS:56B30 read
and the HP write happen in the same causal chain." That filed THIS module's
own result under the provenance module's name. `test_cok_effect7_target_
provenance.py`'s own `test_damage_routine_never_writes_either_structs_hp_field`
proves the opposite for 14F24h taken alone: the DS:56B30 write and the HP
write do NOT happen in the same causal chain there -- 14F24h computes the
scaled damage byte and returns without ever touching either candidate's HP
field, which is exactly why this module's own caller-chain work was needed
to close the gap. What the provenance module actually established is the
disagreeing-input dynamic-execution METHODOLOGY reused above; the
DS:56B30-to-HP-write chain-linking observation itself is first established
in THIS module, by `test_supplier_output_is_consumed_by_the_hp_write_end_to_end`
below.

Chain (file offsets; addresses are within the retail CoK GAME.OVR overlay
pool unless noted):

  0167AFh (external stub 88:5Ch, an attack-resolution entry point)
    -> near-calls 0162E3h
  0162E3h
    -> near-calls 14F24h at 0165F7h (`mov al,[bp-0x15]; push ax; push cs;
       call 0x14f24`)
    -> after 14F24h returns, checks `es:[di+0x189]` (the target's own
       active flag) at 0165FDh, then, when active, calls 0150A8h at
       0166021h, pushing (in caller push order, i.e. reverse of the
       callee's [bp+N] numbering): the mode word 1, DS:56B30 TWICE, a
       message sub-type byte, and two far pointers (the target struct at
       [bp+0xe]/[bp+0x10] in 0150A8's frame, a second struct -- observed to
       be the OTHER combat participant -- at [bp+0x12]/[bp+0x14]).
  0150A8h (a shared, multi-mode "compose combat message" dispatcher --
    every mode branch converges on the same final call)
    -> at file 015229h: `push [bp+0x10]; push [bp+0xe]; mov al,[bp+0xa];
       push ax; lcall 0xe6,0xa7` -- the TARGET far pointer plus one of the
       two pushed DS:56B30 copies (the OTHER copy, at [bp+8], feeds a
       different E6 message-formatting call earlier in the same function
       and is not consulted for the HP write).
  E6:0xA7 = file 038A7Dh (overlay 0xE6, procedure index 27) -- THE HP-WRITE
    CONSUMER. Disassembled in full (038a7dh-038b7ah): reads the target's HP
    byte at es:[di+0x197], compares it to the pushed damage byte, computes
    either the overkill amount (hp < damage, `jb 0x38ab0`) or the remaining
    hp (hp >= damage), sets a status byte at es:[di+0x188] (4 exact-lethal,
    5 partial-overkill <=9, 6 overkill >9 -- boundary confirmed dynamically
    below), clears the active flag es:[di+0x189] via a shared subroutine at
    a46:d79 on any lethal branch, and finally writes the clamped byte back
    to es:[di+0x197] -- either the computed remaining hp (non-lethal, file
    038b70h) or a literal 0 (lethal, file 038b3fh).

CORRECTED 2026-09-09, second site: the "checks `es:[di+0x189]` (...)" line
above used to read "(the attacker's own active flag)". Re-disassembled
0162E3h directly (`python tools/disasm_cok.py dis 0x0165e0 0x40`) to check
this: [bp+0x10]/[bp+0x12] is pushed identically at TWO sites in 0162E3h --
immediately before the 14F24h call (0165E9h: `push [bp+0x14]; push
[bp+0x12]; push [bp+0x10]`) and again immediately before the forward to
0150A8h (0166005h: `push [bp+0x16]; push [bp+0x14]; push [bp+0x12]; push
[bp+0x10]`) -- and 0150A8h's own disassembly (quoted two paragraphs above,
at file 015229h) confirms that exact pointer arrives there as the TARGET
struct, not the attacker's. So `les di, ptr [bp+0x10]; cmp byte ptr
es:[di+0x189],0` at 0165FAh-0165FDh reloads and tests the TARGET's active
flag, not the attacker's -- gating whether 0150A8h/E6:0xA7 fire at all on
whether the TARGET is still active, which is the sensible reading (there is
no reason to gate a hit on the attacker's own liveness) and is now the text
above.

Not independently re-verified for this pass, checked and found accurate:
the file-offset claims immediately above at "non-lethal, file 038b70h" /
"lethal, file 038b3fh" were also flagged by the same adversarial review as
possibly misattributed (docstring lines ~47-49 as they stood then). Direct
disassembly (quoted in full via `python tools/disasm_cok.py dis 0x038a7d
0x110`) traces both write sites exactly as described: 038b3fh
(`mov byte ptr es:[di+0x197],0`) sits on the branch reached when the shared
a46:d79 classifier reports the entity dead (any of status 4/5/6, or any
externally-supplied prior status outside {0,1} per the prior-status-axis
test below) and is preceded by clearing the active flag at 038b36h; 038b70h
(`mov byte ptr es:[di+0x197],al`) sits on the surviving branch and writes
[bp-2], the hp-minus-damage value computed earlier at 038aa9h. No error was
found in this range -- the review's flag on it does not hold here, and that
is reported as a legitimate outcome rather than forcing a change where
disassembly shows none is warranted.

This module does not authorize any mutation-contract callback: it is pure
RE/investigation plus standing regression evidence, matching this session's
scope. `cok-mutation-output-ownership.md`'s `AUTHORIZED_OUTPUT_CALLBACKS`
remains the empty `frozenset()`; nothing here changes it.
"""
from pathlib import Path
import struct

import pytest

pytest.importorskip('unicorn')
from tools.cok_item_removal_oracle import Member, BODY_BASE, pointer
import tools.cok_item_removal_oracle as oracle_mod
from tools.test_cok_effect7_target_provenance import held, machine, call_14f24, A, B

E6A7 = 0x038A7D
MSG_150A8 = 0x0150A8
HP_OFFSET = 0x197
STATUS_OFFSET = 0x188
ACTIVE_OFFSET = 0x189


def call_e6a7(m, target, damage):
    m.execute(E6A7, struct.pack('<H', damage) + pointer(target))


def call_150a8(m, target, other, damage):
    # Push order matches file 016621h's real call site: mode word 1, then
    # DS:56B30 pushed twice, then the message sub-type byte (0 selects the
    # generic/default string, string selection does not gate the HP-write
    # branch this module tests), then the target pointer, then the other
    # participant's pointer.
    args = (struct.pack('<H', 1) + struct.pack('<H', damage) + struct.pack('<H', damage)
            + struct.pack('<H', 0) + pointer(target) + pointer(other))
    m.execute(MSG_150A8, args)


def set_combat_fields(m, addr, *, hp, status=0, active=1):
    m.uc.mem_write(addr + HP_OFFSET, bytes([hp]))
    m.uc.mem_write(addr + STATUS_OFFSET, bytes([status]))
    m.uc.mem_write(addr + ACTIVE_OFFSET, bytes([active]))


def read_combat_fields(m, addr):
    hp = m.uc.mem_read(addr + HP_OFFSET, 1)[0]
    status = m.uc.mem_read(addr + STATUS_OFFSET, 1)[0]
    active = m.uc.mem_read(addr + ACTIVE_OFFSET, 1)[0]
    return hp, status, active


@pytest.mark.parametrize('damage,hp0,expected', [
    (12, 50, (38, 0, 1)),  # partial damage: hp reduced, alive, no status change
    (50, 50, (0, 4, 0)),   # exact-lethal: overkill amount 0
    (59, 50, (0, 5, 0)),   # overkill amount 9: still status 5 (boundary null)
    (60, 50, (0, 6, 0)),   # overkill amount 10: status flips to 6
    (0, 50, (50, 0, 1)),   # zero damage: no-op control
])
def test_e6a7_clamps_hp_and_sets_death_status(held, damage, hp0, expected):
    retail, body, items, effects, id7 = held
    bare = Member(body)
    m = machine(retail, bare, bare)
    set_combat_fields(m, A, hp=hp0, status=0, active=1)
    call_e6a7(m, A, damage)
    assert read_combat_fields(m, A) == expected


@pytest.mark.parametrize('damage,hp0,prior_status,expected', [
    # PRIOR-STATUS AXIS (2026-09-09, adversarial review). Every case above
    # held prior status fixed at 0 -- the axis nothing had swept -- and two
    # additional retail mechanisms live behind it that this project's native
    # cm_authorize_output (native/src/cokremove.inc) and its Python mirror
    # (tools.cok_item_removal.authorize_effect7) do NOT reproduce. Both are
    # confirmed here by executing the retail binary itself, not by reasoning
    # about the disassembly.
    #
    # (1) A second route to status 6: remaining HP hits 0 AND prior status
    # was already 1 (not just the ordinary overkill>9 path).
    (50, 50, 1, (0, 6, 0)),
    # (2) A post-hoc membership gate: if the RESULTING status is outside
    # {0, 1}, HP and active are forced to 0 regardless of the arithmetic --
    # even for a zero-damage call against a target already at status 2.
    (0, 50, 2, (0, 2, 0)),
    # Controls proving the gate is keyed on the RESULTING status, not merely
    # "prior status nonzero": prior status 1 is itself a member of {0,1}, so
    # a zero-damage or partial-damage call leaves it alone.
    (0, 50, 1, (50, 1, 1)),
    (5, 50, 1, (45, 1, 1)),
])
def test_e6a7_prior_status_axis_native_does_not_reproduce(held, damage, hp0, prior_status, expected):
    """Retail ground truth for the prior-status axis. This is deliberately
    NOT a test of native/src/cokremove.inc -- that routine's fix (2026-09-09)
    is to REJECT authorization whenever prior status != 0 (see its `cmp byte
    [bx+392], 0` guard) rather than attempt to reproduce this state machine,
    precisely because it is unverified outside the one case this module's
    other test already covers (prior_status == 0). This test exists so any
    future attempt to widen cm_authorize_output past status-0-only has a
    real oracle to build against, and so the two retail mechanisms the
    review found are pinned as regression evidence in their own right.
    """
    retail, body, items, effects, id7 = held
    bare = Member(body)
    m = machine(retail, bare, bare)
    set_combat_fields(m, A, hp=hp0, status=prior_status, active=1)
    call_e6a7(m, A, damage)
    assert read_combat_fields(m, A) == expected


def test_150a8_forwards_the_pushed_damage_byte_to_e6a7s_hp_write(held):
    # 0150A8's own message composition dereferences the combat sub-struct
    # pointer at struct offset 0x183 (387) through further E6 calls;
    # tools.test_cok_effect7_target_provenance.wire_attack_overlays()
    # zeroes that pointer for both slots (needed for its own 14F24h-only
    # coverage), so this connectivity test wires a scratch sub-struct for
    # both participants before driving the real 0150A8 entry point.
    retail, body, items, effects, id7 = held
    bare = Member(body)
    m = machine(retail, bare, bare)
    scratch_a, scratch_b = 0x77000, 0x77100
    m.uc.mem_write(A + 387, pointer(scratch_a))
    m.uc.mem_write(B + 387, pointer(scratch_b))
    m.uc.mem_write(scratch_a, bytes(0x20))
    m.uc.mem_write(scratch_b, bytes(0x20))
    set_combat_fields(m, A, hp=50, status=0, active=1)
    call_150a8(m, target=A, other=B, damage=12)
    assert read_combat_fields(m, A) == (38, 0, 1)


@pytest.mark.parametrize('real_in_slot0', [False, True])
def test_supplier_output_is_consumed_by_the_hp_write_end_to_end(held, real_in_slot0):
    # The definitive link: 14F24h's own real, disagreeing-input-swept
    # computed damage (test_cok_effect7_target_provenance.py's supplier
    # evidence) fed directly into E6:0xA7 (this module's consumer evidence)
    # on the SAME machine state, for both the firing and non-firing case and
    # both physical slot orientations -- exactly mirroring the existing
    # provenance tests' own parametrization style.
    retail, body, items, effects, id7 = held
    real, bare = Member(body, items, effects), Member(body)
    slot0, slot1 = (real, bare) if real_in_slot0 else (bare, real)
    real_addr = A if real_in_slot0 else B
    bare_addr = B if real_in_slot0 else A

    m_fired = machine(retail, slot0, slot1)
    set_combat_fields(m_fired, bare_addr, hp=50, status=0, active=1)
    fired = call_14f24(m_fired, ptr1=bare_addr, ptr2=real_addr)
    call_e6a7(m_fired, bare_addr, fired['damage'])
    assert read_combat_fields(m_fired, bare_addr) == (50 - fired['damage'], 0, 1)

    m_not_fired = machine(retail, slot0, slot1)
    set_combat_fields(m_not_fired, bare_addr, hp=50, status=0, active=1)
    not_fired = call_14f24(m_not_fired, ptr1=real_addr, ptr2=bare_addr)
    call_e6a7(m_not_fired, bare_addr, not_fired['damage'])
    assert read_combat_fields(m_not_fired, bare_addr) == (50 - not_fired['damage'], 0, 1)

    assert fired['damage'] != not_fired['damage']


def test_mutating_the_hp_write_displacement_breaks_the_pin(held):
    """Mutation control: corrupt E6:0xA7's final write instruction so this
    module's own pin can be seen failing, per this project's "probes must be
    able to fail" convention (`goldbox-probe-must-be-able-to-fail` memory).

    File 038b70h is `26 88 85 97 01` (`mov byte ptr es:[di+0x197],al`, a
    5-byte ES-prefixed mov with a mod=10/rm=101 ModRM byte at 038b72h and a
    little-endian disp16 at 038b73h-038b74h). Zeroing the disp16 LOW byte
    (038b73h: 0x97 -> 0x00) keeps the instruction's length and decode intact
    -- it becomes `mov es:[di+0x100],al` -- so the corruption changes WHERE
    the clamped byte lands without corrupting the surrounding instruction
    stream. (An earlier attempt mutated the ModRM byte at 038b72h instead,
    which shortens the instruction to 3 bytes and desyncs every following
    opcode into unrelated data, crashing far from the write site with an
    unrelated "unmapped instruction" fault -- a real failure, but not the
    narrow, single-effect one this pin should demonstrate.)

    Machine.__init__ hash-pins (image, overlay) via
    tools.cok_item_removal_oracle.validate() and raises before any mutated
    bytes could be used. This test does not disable that guard in general:
    it patches `validate` only for the duration of this one construction,
    and the patched function still calls the REAL validate() against the
    real, unmutated overlay bytes captured by closure -- so a genuinely
    substituted or corrupted retail file would still fail loudly here. Only
    the deliberate in-memory test copy bypasses the pin.
    """
    retail, body, items, effects, id7 = held
    image, overlay, item_table = retail
    assert overlay[0x038b70:0x038b75] == bytes.fromhex('2688859701')
    mutated = bytearray(overlay)
    mutated[0x038b73] = 0x00
    mutated_overlay = bytes(mutated)

    real_validate = oracle_mod.validate

    def bypass_for_this_mutation_only(image_arg, overlay_arg):
        real_validate(image_arg, overlay)

    oracle_mod.validate = bypass_for_this_mutation_only
    try:
        bare = Member(body)
        m = machine((image, mutated_overlay, item_table), bare, bare)
        set_combat_fields(m, A, hp=50, status=0, active=1)
        call_e6a7(m, A, 12)
        mutated_result = read_combat_fields(m, A)
        redirected_byte = m.uc.mem_read(A + 0x100, 1)[0]
    finally:
        oracle_mod.validate = real_validate

    # The pin under test asserts hp == 38 after damage=12 on hp0=50. Under
    # the corrupted write offset the real HP field is left untouched (wrong
    # relative to that assertion) while the clamped value actually landed at
    # the redirected offset instead -- proving the pin can and does fail.
    assert mutated_result == (50, 0, 1)
    assert redirected_byte == 38

    # Reverting to the real, hash-validated bytes restores correct behaviour.
    m2 = machine(retail, bare, bare)
    set_combat_fields(m2, A, hp=50, status=0, active=1)
    call_e6a7(m2, A, 12)
    assert read_combat_fields(m2, A) == (38, 0, 1)
