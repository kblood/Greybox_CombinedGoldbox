"""Original Secret mode1 glyph/tile execution through a declared EGA device.

Bitmap resources/builders and renderers are unchanged original instructions.
Font bytes are a source-pinned preload, not a full font-loader execution claim.
The row-table prerequisite executes an explicitly bounded original basic block;
it does not pretend that internal startup code is a callable function.
"""
import struct

from unicorn import x86_const as x86

from tools.secret_treasure_ega import EgaBridge, EgaDevice
from tools.secret_treasure_graphics_oracle import TreasureGraphicsMachine
from tools.secret_treasure_oracle import PLAYER_DATA
from tools.secret_melee_oracle import STACK_BASE


class TreasureDeviceMachine(TreasureGraphicsMachine):
    def __init__(self, *, low_memory, dll, dll_sha256, keys=(), heap_psp_end=0x4F00):
        super().__init__(low_memory=low_memory, keys=keys, heap_psp_end=heap_psp_end)
        self.ega = EgaDevice(dll, dll_sha256)
        self.bus = EgaBridge(self.uc, self.ega, guards=(self.device_source_guard,))
        # Existing parent calls now use the same emulation entry plus checked
        # device finish/rollback. No original routine or interrupt is replaced.
        self.uc.emu_start = self.bus.emu_start
        # C profile defaults declare post-BIOS SQ0=3/SQ4=6/GC6=5. The actual
        # original initializer programs its owned GC0..5/7/8 and SQ2 subset.
        self.call_resident(0x5400, 0x540, ())
        self.initialize_original_row_table()

    def device_source_guard(self, direction, address, size, value):
        if direction == "write" and any(address < end and address + size > start
                                        for start, end in self.code_ranges):
            raise AssertionError("Original instruction storage cannot become EGA device data")

    def initialize_original_row_table(self):
        bank_preimage = bytes(self.uc.mem_read(PLAYER_DATA + 0x7DEA, 24))
        code_preimage = tuple(bytes(self.uc.mem_read(lo, hi - lo)) for lo, hi in self.code_ranges)
        descriptor = next(d for d in self.retail.descriptors if
                          d["ovr_file_offset"] <= 0x104C1 < d["ovr_file_offset"] + d["code_size"])
        for name, value in (("CS", self.segments[descriptor["index"]]), ("DS", PLAYER_DATA >> 4),
                            ("SS", STACK_BASE >> 4), ("SP", 0xEFE0), ("BP", 0xEFC0), ("EFLAGS", 2)):
            self.uc.reg_write(getattr(x86, "UC_X86_REG_" + name), value)
        self.uc.emu_start(self.location(0x104C1), self.location(0x105E5),
                          count=500000, timeout=5_000_000)
        if (self.reg("CS") << 4) + self.reg("IP") != self.location(0x105E5) or self.unmapped:
            raise AssertionError("Original row-table block did not reach its exact pre-join boundary")
        if self.reg("SP") != 0xEFE0 or self.reg("BP") != 0xEFC0:
            raise AssertionError("Original row-table block changed its declared frame")
        if bytes(self.uc.mem_read(PLAYER_DATA + 0x70F8, 400)) != struct.pack("<200H", *(40 * y for y in range(200))):
            raise AssertionError("Original row-table loop failed complete200-word output")
        if bytes(self.uc.mem_read(PLAYER_DATA + 0x7DEA, 24)) != bank_preimage:
            raise AssertionError("Original row-table probe entered later bank-clear startup join")
        if code_preimage != tuple(bytes(self.uc.mem_read(lo, hi - lo)) for lo, hi in self.code_ranges):
            raise AssertionError("Original table setup mutated source instructions")

    def glyph(self, *, char, x, y, fg, bg, count=1, mode=1):
        self.call_resident(0x55E7, 0x540, (mode, char, count, bg, fg, y, x))

    def tile(self, *, tile=0x137, x=0, y=0, seed=1):
        self.call(0x43E6F, (0, 0, tile, y, x), data_base=PLAYER_DATA, seed=seed)
