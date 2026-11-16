"""Compiled R private stage versus clean-room model and complete original R."""
from pathlib import Path
import shutil
import struct
import subprocess

import pytest
unicorn = pytest.importorskip("unicorn")
from unicorn import x86_const as x86

from tools.secret_reward_party import recalculate_secret
from tools.test_secret_treasure_helpers import gift, SEED, protected, assert_protected
from tools.test_secret_reward_party import owned
from tools.secret_melee_oracle import ACTOR_BASE
from tools.secret_treasure_oracle import PLAYER_DATA

EXPORTS = ("rp_calculate", "rp_body", "rp_ready_weight", "rp_movement", "cs_slots", "input", "catalog")
EXPORTS += ("rc_gems",)
EXPORTS += ("rp_can_take", "offer")
ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def image(tmp_path_factory):
    folder = tmp_path_factory.mktemp("native-reward-r")
    source, binary = folder / "probe.asm", folder / "probe.bin"
    source.write_text("cpu 386\nbits 16\norg 100h\ndw " + ",".join(EXPORTS) + '''
%include "secretreward_party.inc"
%include "secretreward_currency.inc"
input times 440 db 0
catalog times 2048 db 0
offer times 67 db 0
''')
    nasm = shutil.which("nasm") or str(Path.home() / "AppData/Local/bin/NASM/nasm.exe")
    process = subprocess.run([nasm, "-I", str(ROOT / "native/src") + "/", "-f", "bin",
                              str(source), "-o", str(binary)], capture_output=True, timeout=30)
    assert process.returncode == 0, process.stderr
    raw = binary.read_bytes()
    return raw, dict(zip(EXPORTS, struct.unpack_from("<" + "H" * len(EXPORTS), raw)))


def compiled(image, body, stf, sfx, catalogue, bank=0, currency=None, offer=None):
    raw, labels = image
    machine = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_16)
    machine.mem_map(0, 0x60000)
    machine.mem_write(0x10100, raw)
    machine.mem_write(0x10000 + labels["input"], body + b"\0")
    machine.mem_write(0x10000 + labels["catalog"], catalogue)
    if offer is not None:
        assert len(offer) == 67
        machine.mem_write(0x10000 + labels["offer"], offer)
    if stf:
        machine.mem_write(0x40000, stf)
    if sfx:
        machine.mem_write(0x30000, sfx)
    machine.mem_write(0x5fffc, struct.pack("<H", 0xff00))
    for name, value in (("CS", 0x1000), ("DS", 0x1000), ("ES", 0x1000),
                        ("GS", 0x4000), ("FS", 0x3000), ("SS", 0x5000),
                        ("SP", 0xfffc), ("SI", labels["input"]),
                        ("DI", labels["catalog"]), ("BX", 0), ("CX", len(stf)),
                        ("DX", 0), ("EAX", len(sfx)), ("BP", bank), ("EFLAGS", 2)):
        machine.reg_write(getattr(x86, "UC_X86_REG_" + name), value)
    writes = []
    def guard(u, access, address, size, value, unused):
        if address >= 0x20000 and address < 0x50000:
            writes.append((address, size, value))
    machine.hook_add(unicorn.UC_HOOK_MEM_WRITE, guard)
    if currency is not None:
        machine.reg_write(x86.UC_X86_REG_EAX, currency[0])
        machine.reg_write(x86.UC_X86_REG_EDX, currency[1])
    entry = "rc_gems" if currency is not None else "rp_calculate"
    machine.emu_start(0x10000 + labels[entry], 0x1ff00, count=200000)
    assert machine.reg_read(x86.UC_X86_REG_IP) == 0xff00
    assert machine.reg_read(x86.UC_X86_REG_SP) == 0xfffe
    capacity = None
    if offer is not None:
        assert not machine.reg_read(x86.UC_X86_REG_EFLAGS) & 1
        machine.reg_write(x86.UC_X86_REG_DI, labels["offer"])
        machine.reg_write(x86.UC_X86_REG_SP, 0xfffc)
        machine.emu_start(0x10000 + labels["rp_can_take"], 0x1ff00, count=10000)
        assert machine.reg_read(x86.UC_X86_REG_IP) == 0xff00
        assert bytes(machine.mem_read(0x10000 + labels["offer"], 67)) == offer
        capacity = (bool(machine.reg_read(x86.UC_X86_REG_EFLAGS) & 1),
                    machine.reg_read(x86.UC_X86_REG_AX))
    assert not writes
    after_input = bytes(machine.mem_read(0x10000 + labels["input"], 440))
    if currency is None:
        assert after_input == body + b"\0"
    assert bytes(machine.mem_read(0x10000 + labels["catalog"], 2048)) == catalogue
    if stf:
        assert bytes(machine.mem_read(0x40000, len(stf))) == stf
    if sfx:
        assert bytes(machine.mem_read(0x30000, len(sfx))) == sfx
    if currency is not None:
        return (bool(machine.reg_read(x86.UC_X86_REG_EFLAGS) & 1), after_input[:439],
                machine.reg_read(x86.UC_X86_REG_EAX), machine.reg_read(x86.UC_X86_REG_EDX),
                machine.reg_read(x86.UC_X86_REG_CX))
    result = (bytes(machine.mem_read(0x10000 + labels["rp_body"], 439)),
              struct.unpack("<H", machine.mem_read(0x10000 + labels["rp_ready_weight"], 2))[0],
              machine.mem_read(0x10000 + labels["rp_movement"], 1)[0])
    slots = struct.unpack("<13I", machine.mem_read(0x10000 + labels["cs_slots"], 52))
    result_tuple = bool(machine.reg_read(x86.UC_X86_REG_EFLAGS) & 1), result, slots
    return (*result_tuple, capacity) if offer is not None else result_tuple


@pytest.mark.parametrize("actor", range(6))
def test_compiled_r_matches_full_original_scalar_write_set(image, gift, actor):
    source = gift
    party = owned(source)
    hero = party.heroes[actor]
    model = recalculate_secret(hero.body, hero.stf, hero.sfx, party.catalogue)
    bad, result, slots = compiled(image, hero.body, hero.stf, hero.sfx, party.catalogue)
    assert not bad and result == (model.body, model.ready_weight, model.movement_global)
    assert slots == (0xffffffff,) * 13
    guard = protected(source)
    address = ACTOR_BASE + actor * 439
    source.call(0x3A292, (address % 16, address >> 4), data_base=PLAYER_DATA, seed=SEED)
    actual = bytearray(source.uc.mem_read(address, 439))
    actual[357:409] = hero.body[357:409]  # Explicit archived-equipment policy.
    assert bytes(actual) == result[0]
    assert_protected(source, guard)


@pytest.mark.parametrize("case", ["armor", "coins", "effects", "movement-wrap", "children", "ready-non128"])
def test_compiled_projector_discriminates_owned_contexts(image, gift, case):
    hero = owned(gift).heroes[0]
    body = bytearray(hero.body)
    stf, sfx, bank = hero.stf, hero.sfx, 0
    if case in ("armor", "ready-non128"):
        item = bytearray(gift.retail.inventories[72] + bytes(4))
        if case == "ready-non128":
            item[52] = 1
        stf = bytes(item)
    elif case == "coins":
        struct.pack_into("<7H", body, 259, 800, 1, 2, 3, 4, 5, 6)
    elif case == "effects":
        sfx += b"".join(bytes((kind, 0, 0, 0, 0)) + bytes(4) for kind in (39, 42, 74))
    elif case == "movement-wrap":
        bank = 255
    elif case == "children":
        parent = bytearray(gift.retail.inventories[72] + bytes(4))
        parent[46], parent[52], parent[57] = 73, 0, 1
        stf = bytes(parent) + gift.retail.inventories[72] + bytes(4)
    model = recalculate_secret(bytes(body), stf, sfx, gift.retail.definitions, bank)
    bad, result, _ = compiled(image, bytes(body), stf, sfx, gift.retail.definitions, bank)
    assert not bad and result == (model.body, model.ready_weight, model.movement_global)
    assert result[0][357:409] == bytes(body[357:409])


@pytest.mark.parametrize("case", ["short-stf", "short-sfx", "child-overrun", "bad-kind", "bad-strength", "bad-exception"])
def test_compiled_projector_rejects_private_stage_without_input_writes(image, gift, case):
    hero = owned(gift).heroes[0]
    body, stf, sfx = bytearray(hero.body), hero.stf, hero.sfx
    if case == "short-stf": stf = bytes(66)
    if case == "short-sfx": sfx += b"x"
    if case in ("child-overrun", "bad-kind"):
        item = bytearray(67)
        item[46], item[57] = (73, 2) if case == "child-overrun" else (128, 0)
        stf = bytes(item)
    if case == "bad-strength": body[17] = 26
    if case == "bad-exception": body[17], body[28] = 18, 101
    bad, _, _ = compiled(image, bytes(body), stf, sfx, gift.retail.definitions)
    assert bad


@pytest.mark.parametrize("requested,pool,encumbrance,balance", [
    (3, 20, None, None), (20, 17, None, None), (0, 20, None, None),
    (3, 2, 1999, None), (2, 20, None, 65535), (20, 20, 65535, None),
])
def test_compiled_gems_matches_source_checked_party_projection(image, gift, requested, pool, encumbrance, balance):
    from dataclasses import replace
    from tools.secret_reward_party import transfer_gems
    party = owned(gift)
    hero = party.heroes[0]
    body = bytearray(hero.body)
    if encumbrance is not None: struct.pack_into("<H", body, 411, encumbrance)
    if balance is not None: struct.pack_into("<H", body, 269, balance)
    party = replace(party, heroes=(replace(hero, body=bytes(body)),) + party.heroes[1:])
    expected = transfer_gems(party, (0, 0, 0, 0, 0, pool, 0), 0, requested)
    bad, output, amount, remaining, status = compiled(image, bytes(body), hero.stf, hero.sfx,
                                                    party.catalogue, currency=(requested, pool))
    assert not bad
    assert output == expected.party.heroes[0].body and amount == expected.transferred
    assert remaining == expected.pools[5]
    assert status == (3 if expected.refused else 1 if amount else 2)


@pytest.mark.parametrize("case", ["normal", "sixteen", "overweight", "word-wrap", "quantity"])
def test_compiled_item_predicate_uses_normalized_count_and_word_total(image, gift, case):
    from dataclasses import replace
    from tools.secret_reward_party import take_item
    party = owned(gift)
    hero = party.heroes[0]
    body = bytearray(hero.body)
    offer = bytearray(gift.retail.inventories[72] + bytes(4))
    stf = hero.stf
    if case == "sixteen": stf = bytes(offer) * 16
    if case == "overweight":
        body[17], body[28] = 7, 0
        struct.pack_into("<H", body, 269, 1000)
    if case == "word-wrap": struct.pack_into("<H", body, 269, 65535)
    if case == "quantity": offer[57] = 255
    party = replace(party, heroes=(replace(hero, body=bytes(body), stf=stf),) + party.heroes[1:])
    expected = take_item(party, 0, bytes(offer))
    _, _, _, (bad, refused) = compiled(image, bytes(body), stf, hero.sfx, party.catalogue, offer=bytes(offer))
    assert not bad and refused == int(not expected.accepted)
