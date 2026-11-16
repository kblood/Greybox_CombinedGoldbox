"""Source-owned resident public-call relocation prerequisite, not full UI."""
from copy import deepcopy
from dataclasses import replace
import struct

import pytest
pytest.importorskip("unicorn")

from tools.secret_melee_oracle import DEFAULT_ROOT, HASHES, load
from tools.exepack_unpack import unpack_complete_load_image
from tools.secret_treasure_menu_oracle import public_target, resident_public_calls


@pytest.fixture(autouse=True)
def required_dos_sources():
    for name in HASHES:
        if not (DEFAULT_ROOT / name).is_file():
            pytest.skip(f"Absent never-vendored DOS input {name}")


def test_actual_mz_call_and_public_stub_own_bitmap_helper():
    retail = load()
    _, metadata = unpack_complete_load_image(DEFAULT_ROOT / "START.EXE")
    rows = resident_public_calls(retail, metadata)
    assert len(rows) == 72
    row = next(row for row in rows if row["sourceCall"] == 0x1A05)
    assert row == dict(sourceCall=0x1A05, relocation=0x1A08,
                       sourceStub=0x20EF, descriptor=36, procedure=0x1C4)
    assert retail.image[0x1A05:0x1A0A] == bytes.fromhex("9a2f000c02")
    assert retail.image[0x20EF:0x20F4] == bytes.fromhex("cd3fc40100")
    descriptor = retail.descriptors[36]
    assert descriptor["ovr_file_offset"] + row["procedure"] == 0x43E6F
    assert retail.overlay[0x43FBC:0x43FBF] == b"\xca\x0a\0"


@pytest.mark.parametrize("offset", [1, 2, 3, 4])
def test_stub_interior_is_not_an_owned_entry(offset):
    with pytest.raises(ValueError, match="Misaligned"):
        public_target(load(), 0x20EF + offset)


def test_ffff_public_slot_is_not_a_callable_target():
    with pytest.raises(ValueError, match="outside"):
        public_target(load(), 0x20E5)


def test_changed_metadata_cannot_redirect_original_stub():
    retail = load(); descriptors = deepcopy(retail.descriptors)
    descriptors[36]["runtime_stub_proc_offsets"][3] += 1
    with pytest.raises(ValueError, match="does not own"):
        public_target(replace(retail, descriptors=descriptors), 0x20EF)


def test_target_at_body_end_is_rejected():
    retail = load(); descriptors = deepcopy(retail.descriptors)
    descriptors[36]["code_size"] = 0x1C4
    with pytest.raises(ValueError, match="outside"):
        public_target(replace(retail, descriptors=descriptors), 0x20EF)


def test_unowned_resident_entry_keeps_ordinary_mz_relocation():
    assert public_target(load(), 0x20DC) is None
