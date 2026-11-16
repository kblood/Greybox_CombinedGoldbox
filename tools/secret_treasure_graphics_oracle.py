"""Original Secret bitmap factory prerequisite for the reward UI.

Reads the original archive through real DAX/heap/builder/converter routines.
No image decoder, tile helper, renderer or allocator is replaced.
"""
import hashlib
import struct
import time

from unicorn import UC_HOOK_CODE
from unicorn import x86_const as x86

from tools.secret_melee_oracle import DEFAULT_ROOT, STACK_BASE, RETURN, dax_members
from tools.secret_treasure_menu_oracle import TreasureMenuMachine
from tools.secret_treasure_oracle import PLAYER_DATA

ARCHIVE_SHA = "e6cf50dabff7b77b39ca0c8457ad8332bc242405104ed113e62249fce31ba1c9"
MEMBER_SHA = "b2ed18da32e6100f22c159988ad4770400e2b8e9f91bff1fb68b2e764b9cad13"


class TreasureGraphicsMachine(TreasureMenuMachine):
    def call(self, file_offset, args, *, stop=None, seed=1, parity=1, data_base=PLAYER_DATA):
        if file_offset != 0x43CF8:
            return super().call(file_offset, args, stop=stop, seed=seed,
                                parity=parity, data_base=data_base)
        if args != (4, 202) or stop is not None or data_base != PLAYER_DATA:
            raise ValueError("Scoped factory budget requires exact source slot4/member202")
        raw = self.files["8X8D1.DAX"]
        member = dax_members(raw)[202]
        if (hashlib.sha256(raw).hexdigest() != ARCHIVE_SHA or
                hashlib.sha256(member).hexdigest() != MEMBER_SHA or
                len(member) != 3249 or struct.unpack_from("<HH", member) != (8, 1) or member[8] != 101):
            raise ValueError("Scoped original factory input differs")
        address = self.location(file_offset)
        segment = self.segments[36]
        for name, value in (("CS", segment), ("DS", data_base >> 4), ("ES", data_base >> 4),
                            ("SS", STACK_BASE >> 4), ("SP", 0xF000), ("BP", 0),
                            ("AX", 0), ("DX", 0), ("EFLAGS", 2)):
            self.uc.reg_write(getattr(x86, "UC_X86_REG_" + name), value)
        self.uc.mem_write(STACK_BASE + 0xF000, struct.pack("<HH2H", 0, RETURN >> 4, *args))
        self.uc.mem_write(data_base + 0x599C, struct.pack("<I", seed))
        self.uc.mem_write(data_base + 0x8DC7, bytes([parity]))
        self.factory_instructions = 0; self.factory_frames = []
        def count(uc, pc, size, unused):
            self.factory_instructions += 1
            if pc == 0x131EA:
                bp = (self.reg("SS") << 4) + self.reg("BP")
                self.factory_frames.append((self.factory_instructions,
                                            uc.mem_read(bp - 0x16, 1)[0],
                                            uc.mem_read(bp - 0x29, 1)[0]))
        hook = self.uc.hook_add(UC_HOOK_CODE, count)
        started = time.monotonic()
        try:
            self.uc.emu_start(address, RETURN, count=2_000_000, timeout=20_000_000)
        finally:
            self.factory_seconds = time.monotonic() - started
            self.uc.hook_del(hook)
        if (self.reg("CS") << 4) + self.reg("IP") != RETURN or self.unmapped:
            raise AssertionError("Scoped original bitmap factory did not fully return")
        if self.reg("SP") != 0xF008 or self.handles:
            raise AssertionError("Original bitmap factory left stack/files unbalanced")
        return self.reg("AX") & 255

    def __init__(self, *, low_memory, keys=(), resource_available=True, heap_psp_end=0x4F00):
        # Bank is genuinely unallocated at this constructor phase. No tile
        # dispatch runs until the original source factory below establishes it.
        super().__init__(low_memory=low_memory, keys=keys, bitmap_bank4=b"", heap_psp_end=heap_psp_end)
        raw = (DEFAULT_ROOT / "8X8D1.DAX").read_bytes()
        if hashlib.sha256(raw).hexdigest() != ARCHIVE_SHA:
            raise ValueError("Held bitmap archive changed")
        self.files["8X8D1.DAX"] = raw
        self.resource_available = resource_available
        self.uc.mem_write(PLAYER_DATA + 0x6816, b"\1")  # original config'E' planar
        self.uc.mem_write(PLAYER_DATA + 0x7420, b"\1")  # separate resource suffix
        # Genuine original builder, exactly the startup temp/screen arguments.
        self.call_resident(0x460B, 0x2BC, (0x7DFE, PLAYER_DATA >> 4, 0, 1, 1, 8))
        self.call_resident(0x460B, 0x2BC, (0x6818, PLAYER_DATA >> 4, 0, 1, 21, 168))
        # Full original descriptor36 loader: BP+6 slot4, BP+8 member202.
        self.call(0x43CF8, (4, 202), data_base=PLAYER_DATA)
        if bytes(self.uc.mem_read(PLAYER_DATA + 0x7DFA, 4)) == bytes(4):
            raise AssertionError("Original missing resource left no bitmap bank")
        self.bitmap_scope = "source-owned original mode1 bank/temp/screen factories"

    def interrupt(self, uc, number, unused):
        ax = self.reg("AX")
        if number == 0x21 and ax >> 8 in (0x4E, 0x3D):
            address = (self.reg("DS") << 4) + self.reg("DX")
            raw = bytes(uc.mem_read(address, 128))
            if b"\0" not in raw:
                raise AssertionError("Unterminated original bitmap filename")
            name = raw.split(b"\0", 1)[0].decode("ascii")
            if name.upper() == "8X8D1.DAX":
                if not self.resource_available:
                    self.events.append({"interrupt": number, "ax": ax, "path": name,
                                        "cwd": "C:\\IMPORT", "error": 2})
                    self.word("AX", 2); self.carry(True)
                    return
                data = self.files["8X8D1.DAX"]
                self.events.append({"interrupt": number, "ax": ax, "path": name,
                                    "cwd": "C:\\IMPORT", "size": len(data)})
                if ax >> 8 == 0x4E:
                    if not self.dta:
                        raise AssertionError("Bitmap FindFirst without original DTA")
                    dta = bytearray(43); struct.pack_into("<I", dta, 26, len(data))
                    dta[30:40] = b"8X8D1.DAX\0"; uc.mem_write(self.dta, bytes(dta))
                else:
                    handle = self.next_handle; self.next_handle += 1
                    self.handles[handle] = [data, 0, name]; self.word("AX", handle)
                self.carry(False)
                return
        return super().interrupt(uc, number, unused)

    def bitmap(self, pointer_offset, size):
        offset, segment = struct.unpack("<HH", self.uc.mem_read(PLAYER_DATA + pointer_offset, 4))
        address = (segment << 4) + offset
        if not address:
            raise AssertionError("Original factory did not establish a non-null bitmap")
        return address, bytes(self.uc.mem_read(address, size))
