"""Original 14F24h direct execution: effect-7 target provenance and output ownership.

Prior research (docs/engine/research/cok-item-removal-native-plan.md,
docs/engine/HANDOFF-NATIVE-DOS-2026-09-08.md task 1) reached 14F24h's mode-4
dispatch (db:34 at file 034527h -> 0342FDh -> E6:A2 at file 0389EDh) through
static disassembly only, and had not run the chain with disagreeing inputs.
This module turns it into bounded, dynamically-verified standing evidence,
executing 14F24h directly rather than through the item-removal destroy()
callback that the existing 339 tests in test_cok_effect7_context.py already
cover.

Measured this session, independent of and complementary to that static
reading: E6:A2 (file 0389edh) does `les di, ptr [bp+0xc]` then reads
`es:[di+0xe3]`/`es:[di+0xe5]` (the 227/229 effects-list head, matching
Machine.__init__'s own `body[227:231] = pointer(effects[0]...)`), walks
9-byte records with the link at +5, and compares each record's id byte
(`[di]`) against its own `[bp+0xa]` byte argument -- never against the
record's offset-4 "applied" byte. `[bp+0xc]` is 14F24h's own second far
pointer argument, forwarded unchanged through the whole chain.

Dynamic sweeps below deliberately contradict the rest of the earlier
hypothesis: the synthetic combat context's target field
(cok_effect7_oracle.CONTEXT_BASE+10) and the "active/selected character"
global at DS:609A do NOT gate or supply this target -- swept against every
combination with the real second-argument value and never seen to matter.
The effect record's own applied byte also does not gate this attack-damage
path, unlike the item-removal destroy() callback where it does
(test_cok_effect7_context.py's
test_callback_global_effects_do_not_hide_body_or_list_differences). Every
claim below has an explicit contrasting case that would fail if the code
used a different argument or dropped a guard, so half of each parametrized
set is a null: swapping which physical address holds the qualifying struct,
or which record id is present, flips the expected draw count.
"""
from pathlib import Path
import struct

import pytest

pytest.importorskip('unicorn')
from unicorn import UC_HOOK_MEM_WRITE
from tools.cok_item_removal_oracle import Member, BODY_BASE, pointer, address, load
from tools.cok_effect7_oracle import ContextMachine
from tools.borland_overlay import read_descriptor

SEED = 0xDEADBEEF
RECURRENCE = 0x08088405
A, B = BODY_BASE, BODY_BASE+512
# Confirmed by disassembling the routine immediately after E6:A2 (file
# 038a7dh), which reads the same struct's HP byte as `es:[di+0x197]`.
HP_OFFSET = 0x197
# F273 requests 22 bytes per owner; two returned pointers were observed 24
# bytes apart. Keep the sweep bound named as an allocator stride, not a
# verified context size.
CONTEXT_ALLOCATION_STRIDE = 24
NO_FIRE_RNG = (SEED*RECURRENCE+1) & 0xFFFFFFFF
FIRE_RNG = (NO_FIRE_RNG*RECURRENCE+1) & 0xFFFFFFFF


@pytest.fixture(scope='module')
def held():
    game = Path(__file__).resolve().parents[1]/'Champions of Krynn'
    names = ('START.EXE', 'GAME.OVR', 'ITEMS', 'SAVE/CHRDATA4.SAV',
             'SAVE/CHRDATA4.STF', 'SAVE/CHRDATA4.SFX')
    if any(not (game/name).exists() for name in names):
        pytest.skip('held CoK fourth party member unavailable')

    def records(ext, width):
        raw = (game/f'SAVE/CHRDATA4.{ext}').read_bytes()
        assert len(raw) % width == 0
        return tuple(raw[i:i+width] for i in range(0, len(raw), width))

    body = (game/'SAVE/CHRDATA4.SAV').read_bytes()
    items = records('STF', 63)
    effects = records('SFX', 9)
    assert any(r[46] == 67 and r[52] and r[61:63] == bytes((7, 128)) for r in items)
    id7 = next(r for r in effects if r[0] == 7 and r[4] == 1)
    return load(game), body, items, effects, id7


def wire_attack_overlays(m, retail):
    # 14F24h's mode-4 dispatch reaches db:34 (034527h) and E6:A2 (0389edh),
    # neither of which ContextMachine's own overlay set (0x124/0x116/0x111,
    # used only by its range()/destroy() methods) maps. The combat-context
    # initializer 0xF273h that a real caller runs first also needs a fully
    # populated 4-pointer free-list table at DS:54386h (Machine.__init__
    # wires only two of its four slots for the item-removal path) and a
    # scratch allocator arena. Reproduced from build/probe-cok-target-
    # substitution.py, the exploratory probe this module supersedes with
    # standing, applied/unapplied-controlled coverage.
    for source, segment, limit in ((0x5E, 0x8200, 0x85000), (0x88, 0xF100, 0x100000)):
        d = read_descriptor(retail[0], retail[1], source)
        assert segment*16+d.code_size < limit
        m.overlays.append((d, segment))
        m.uc.mem_write(segment*16, retail[1][d.file_offset:d.file_offset+d.code_size])
        for i, off in enumerate(d.procedure_offsets):
            m.uc.mem_write(d.segment*16+32+5*i, b'\xea'+struct.pack('<HH', off, segment))
    m.uc.mem_write(0x54386, pointer(0x8F000)*2+pointer(0x8FF00)+pointer(0x8F000))
    m.uc.mem_write(0x5439A, struct.pack('<HH', 0xA9, 0xA46))
    m.uc.mem_write(0x54B2C, pointer(0x74000))
    m.uc.mem_write(0x74000, bytes(0x680))
    m.uc.mem_write(0x7467C, struct.pack('<H', 2))
    for i in range(2):
        m.uc.mem_write(BODY_BASE+i*512+387, bytes(4))


def machine(retail, slot0, slot1):
    m = ContextMachine(retail, (slot0, slot1))
    wire_attack_overlays(m, retail)
    m.execute(0xF273)
    return m


def call_14f24(m, ptr1, ptr2, *, word=1, seed=SEED, context_target=None, active_override=None):
    if context_target is not None:
        # FINDING (2026-09-09): this used to write only `context+10`, an
        # offset carried over by analogy with cok_effect7_oracle.py's
        # ContextMachine.__init__, which builds an unrelated SYNTHETIC combat
        # context and hand-sets CONTEXT_BASE+10 as its "target" field. That
        # analogy does not hold here. ContextMachine.__init__ itself first
        # writes BODY_BASE+387 = pointer(CONTEXT_BASE) -- but machine() (this
        # module) then calls wire_attack_overlays(), which ZEROES
        # BODY_BASE+{0,1}*512+387, and then runs the real m.execute(0xF273),
        # which REALLOCATES a brand-new context from the DOS free-list
        # allocator (dynamically confirmed: owner0 -> 0x8F000, owner1 ->
        # 0x8F018, 24 bytes after the first pointer (F273 requests 22 bytes),
        # with no verified relationship to ContextMachine's synthetic layout)
        # before this function ever runs.
        # function ever runs. The `+10` guess was never re-verified against
        # the REAL, reallocated struct. Dynamic tracing found a genuine
        # 4-byte far-pointer READ at the real struct's own offset+10/+12
        # during dispatch (not nothing, so "unread" would also have been the
        # wrong story) -- but pointing that pointer at an otherwise-idle
        # dummy struct produced ZERO reads from that dummy struct, so the
        # loaded value is read and then never dereferenced. Rather than keep
        # resting the "does not gate or supply target" claim on that one
        # borrowed, coincidentally-live offset, this now overwrites the
        # ENTIRE observed allocation stride (CONTEXT_ALLOCATION_STRIDE bytes)
        # with context_target's pointer, repeated to fill the span -- an
        # address-agnostic sweep. A brute-force per-offset control (all 24
        # offsets x {A, B}, both the firing and non-firing pointer order) was
        # run separately and confirms NEITHER the RNG draw count nor the
        # computed damage byte ever differs from the no-write baseline at
        # ANY offset: the conclusion is unchanged by this correction, now on
        # a verified footing instead of an inherited assumption.
        fill = (pointer(context_target) * ((CONTEXT_ALLOCATION_STRIDE//4)+1))[:CONTEXT_ALLOCATION_STRIDE]
        for owner in (0, 1):
            context = address(bytes(m.uc.mem_read(BODY_BASE+owner*512+387, 4)))
            if context:
                m.uc.mem_write(context, fill)
    if active_override is not None:
        m.uc.mem_write(0x5609A, pointer(active_override))
    m.uc.mem_write(0x543AE, struct.pack('<I', seed))
    m.uc.mem_write(0x56B30, b'\xa5')
    body_writes = []

    def rec(uc, access, addr, size, value, _):
        base = A if A <= addr < A+512 else B if B <= addr < B+512 else None
        if base is not None:
            body_writes.append((addr-base, size, value))
    hook = m.uc.hook_add(UC_HOOK_MEM_WRITE, rec, begin=A, end=B+512)
    m.execute(0x14F24, struct.pack('<H', word)+pointer(ptr1)+pointer(ptr2))
    m.uc.hook_del(hook)
    rng = struct.unpack('<I', m.uc.mem_read(0x543AE, 4))[0]
    return dict(rng=rng, damage=m.uc.mem_read(0x56B30, 1)[0],
                dice_count=m.uc.mem_read(0x56B34, 1)[0], body_writes=tuple(body_writes))


def draw_count(rng, seed=SEED, limit=6):
    state = seed
    for n in range(1, limit+1):
        state = (state*RECURRENCE+1) & 0xFFFFFFFF
        if state == rng:
            return n
    raise AssertionError(f'final rng {rng:#010x} matches none of the first {limit} draws from {seed:#010x}')


@pytest.mark.parametrize('real_in_slot0', [False, True])
def test_target_is_second_pointer_argument_regardless_of_physical_slot(held, real_in_slot0):
    retail, body, items, effects, id7 = held
    real, bare = Member(body, items, effects), Member(body)
    slot0, slot1 = (real, bare) if real_in_slot0 else (bare, real)
    real_addr = A if real_in_slot0 else B
    bare_addr = B if real_in_slot0 else A
    m = machine(retail, slot0, slot1)
    fired = call_14f24(m, ptr1=bare_addr, ptr2=real_addr)
    not_fired = call_14f24(m, ptr1=real_addr, ptr2=bare_addr)
    assert draw_count(fired['rng']) == 2 and fired['rng'] == FIRE_RNG
    assert draw_count(not_fired['rng']) == 1 and not_fired['rng'] == NO_FIRE_RNG
    assert fired['damage'] != not_fired['damage']


def test_mode4_callback_receives_originally_allocated_owner_context(held):
    retail, body, items, effects, id7 = held
    real, bare = Member(body, items, effects), Member(body)
    m = machine(retail, bare, real)
    fired = call_14f24(m, ptr1=A, ptr2=B)
    assert draw_count(fired['rng']) == 2

    # This route runs the original F273 initializer after clearing both body
    # pointers. The callback must therefore see the context allocated for the
    # real second-argument owner, not ContextMachine's synthetic CONTEXT_BASE.
    assert len(m.callback_calls) == 1
    callback, caller, handle, member, context, context_target = m.callback_calls[0]
    assert callback == 0x10DF0
    assert caller == 0x34190
    assert member == B
    assert context == 0x8F018
    assert context != 0x71000
    assert context_target == 0  # F273 clears this field; no target is inferred.


@pytest.mark.parametrize('ptr2_selects_real,context_target,active_override', [
    (True, None, None), (True, A, None), (True, B, None),
    (True, None, A), (True, None, B), (True, A, A), (True, B, B),
    (False, None, None), (False, A, None), (False, B, None),
    (False, None, A), (False, None, B), (False, A, A), (False, B, B),
])
def test_context_target_and_active_pointer_do_not_gate_or_supply_target(
        held, ptr2_selects_real, context_target, active_override):
    retail, body, items, effects, id7 = held
    real, bare = Member(body, items, effects), Member(body)
    # The real struct is always at B. context_target and active_override are
    # independently swept across {None, A, B}, including combinations that
    # actively disagree with ptr2, to prove neither one is consulted:
    # ptr2 alone must keep deciding the outcome.
    m = machine(retail, bare, real)
    ptr2 = B if ptr2_selects_real else A
    ptr1 = A if ptr2_selects_real else B
    result = call_14f24(m, ptr1=ptr1, ptr2=ptr2,
                        context_target=context_target, active_override=active_override)
    expected_draws, expected_rng = (2, FIRE_RNG) if ptr2_selects_real else (1, NO_FIRE_RNG)
    assert draw_count(result['rng']) == expected_draws and result['rng'] == expected_rng


def test_effect_list_without_id7_record_does_not_fire_even_when_non_null(held):
    retail, body, items, effects, id7 = held
    non7 = Member(body, (), (bytes([99, 0, 0, 0, 1, 0, 0, 0, 0]),))
    bare = Member(body)
    m = machine(retail, bare, non7)
    result = call_14f24(m, ptr1=A, ptr2=B)
    assert draw_count(result['rng']) == 1 and result['rng'] == NO_FIRE_RNG


def test_applied_byte_does_not_gate_this_attack_path(held):
    # Contrast with the item-removal callback (test_cok_effect7_context.py),
    # where zeroing this same byte suppresses the callback. For 14F24h's
    # direct attack dispatch it does not: only the record's id byte (offset
    # 0) is consulted by E6:A2's walk (file 038a29: `cmp al, byte ptr
    # [bp+0xa]`), never its offset-4 applied flag.
    retail, body, items, effects, id7 = held
    unapplied = tuple(r[:4]+b'\0'+r[5:] if r[0] == 7 else r for r in effects)
    assert any(r[0] == 7 and r[4] == 0 for r in unapplied)
    real_unapplied = Member(body, items, unapplied)
    bare = Member(body)
    m = machine(retail, bare, real_unapplied)
    result = call_14f24(m, ptr1=A, ptr2=B)
    assert draw_count(result['rng']) == 2 and result['rng'] == FIRE_RNG


def test_items_are_not_required_for_the_replacement_draw(held):
    # E6:A2 walks the target struct's effects list directly (offset+0xE3);
    # it never consults the items list (offset+0x143/323), so a struct with
    # only an id-7 effect record and no items still triggers the draw.
    retail, body, items, effects, id7 = held
    only_effect = Member(body, (), (id7,))
    bare = Member(body)
    m = machine(retail, bare, only_effect)
    result = call_14f24(m, ptr1=A, ptr2=B)
    assert draw_count(result['rng']) == 2 and result['rng'] == FIRE_RNG


@pytest.mark.parametrize('real_in_slot0', [False, True])
def test_damage_routine_never_writes_either_structs_hp_field(held, real_in_slot0):
    # 14F24h computes and scales damage into DS:56B30 but returns without
    # applying it: the HP field is never written on either struct, in the
    # firing or non-firing case. 14F24h is therefore not the consumer of
    # its own output; its own (unlocated) caller is.
    #
    # VACUOUSNESS CHECKED (2026-09-09, adversarial review flagged this pair
    # of asserts as possibly unable to fail). Two things had to be true for
    # them to be real: the `rec` hook in call_14f24 must actually capture
    # live writes in this run (not an empty tuple every time), and the
    # `offset == HP_OFFSET` test must be capable of matching something that
    # really happens. Measured directly: call_14f24 against this same
    # fixture produces body_writes == ((396, 1, 40), (396, 1, 40)) -- two
    # real writes at offset 0x18C, twelve bytes short of HP_OFFSET (0x197).
    # Mutation proof: temporarily changing both asserts' `HP_OFFSET` to the
    # literal 396 (the offset that DOES occur) turned both parametrized
    # cases RED (`assert not True`) against the unmodified retail binary;
    # restoring the file byte-exact (sha256
    # ee0b1dff9b83f180246a01761b7ed5f40549444cb24a748e9fa924bb210dbfc8,
    # verified, never via git restore) returned both to GREEN. So the
    # asserts as written are NOT vacuous -- they sit twelve bytes from a
    # genuinely-occurring write and would catch a real regression that
    # moved or added an HP-field write inside 14F24h. Left unchanged.
    retail, body, items, effects, id7 = held
    real, bare = Member(body, items, effects), Member(body)
    slot0, slot1 = (real, bare) if real_in_slot0 else (bare, real)
    real_addr = A if real_in_slot0 else B
    bare_addr = B if real_in_slot0 else A
    m = machine(retail, slot0, slot1)
    fired = call_14f24(m, ptr1=bare_addr, ptr2=real_addr)
    not_fired = call_14f24(m, ptr1=real_addr, ptr2=bare_addr)
    assert not any(offset == HP_OFFSET for offset, size, value in fired['body_writes'])
    assert not any(offset == HP_OFFSET for offset, size, value in not_fired['body_writes'])
