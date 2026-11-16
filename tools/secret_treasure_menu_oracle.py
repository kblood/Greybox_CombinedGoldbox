"""Original empty-COMBAT/reward UI dependency executor; no native behavior.

All cleanup, XP, rendering, list, amount and transfer routines remain original.
This scaffold requires explicit low memory and future BIOS input. Completion
and payout semantics must be established by observed full-handler returns.
"""
from collections import deque
import struct

from unicorn import UC_HOOK_CODE
from unicorn import x86_const as x86

from tools.secret_treasure_oracle import TreasureMachine, PLAYER_DATA, ACTOR_BASE, COMBAT
from tools.secret_print_oracle import FONT_BASE, original_font
from tools.secret_melee_oracle import pointer
from tools.secret_who_oracle import AREA_BASE
from tools.exepack_unpack import unpack_complete_load_image
from tools.secret_melee_oracle import DEFAULT_ROOT

BANK1 = 0x3B000
INPUT = 0x3D59C
CHECKPOINTS = (0x8230, 0x6F90, 0x6A78, 0x6DA3, 0x7D29, 0x744F,
               0x7A28, 0x773F, 0x34765, 0x344E4, 0x8843, 0x38589)


class MissingOriginalInput(AssertionError):
    pass


def public_target(retail, stub_address):
    """Resolve only exact source-owned public slots, never arbitrary INT IPs."""
    for descriptor in retail.descriptors:
        start = descriptor["runtime_stub_array_image_offset"]
        extent = descriptor["stub_count"] * 5
        if start <= stub_address < start + extent:
            if (stub_address - start) % 5:
                raise ValueError("Misaligned original public stub")
            index = (stub_address - start) // 5
            raw = retail.image[stub_address:stub_address + 5]
            proc = descriptor["runtime_stub_proc_offsets"][index]
            if raw != b"\xcd\x3f" + struct.pack("<H", proc) + bytes([descriptor["stub_tags"][index]]):
                raise ValueError("Public metadata does not own original stub bytes")
            if proc == 0xFFFF or not 0 <= proc < descriptor["code_size"]:
                raise ValueError("Original public target lies outside its body")
            return descriptor["index"], proc
    return None


def resident_public_calls(retail, metadata):
    """Source MZ far-CALL relocations, matching existing overlay preload policy."""
    rows = []
    for relocation in metadata.relocations:
        word = relocation.target
        if word < 3 or retail.image[word - 3] != 0x9A:
            continue
        offset, segment = struct.unpack_from("<HH", retail.image, word - 2)
        target = public_target(retail, segment * 16 + offset)
        if target is not None:
            rows.append({"sourceCall": word - 3, "relocation": word,
                         "sourceStub": segment * 16 + offset,
                         "descriptor": target[0], "procedure": target[1]})
    return tuple(rows)


class TreasureMenuMachine(TreasureMachine):
    def __init__(self, *, low_memory, keys=(), bitmap_bank4=None, heap_psp_end=0x4F00):
        if low_memory is None or len(low_memory) != 256:
            raise ValueError("Explicit 256-byte DOS low-memory input is required for nil-child reads")
        super().__init__(players=True, sound_mode=5, heap_psp_end=heap_psp_end)
        _, metadata = unpack_complete_load_image(DEFAULT_ROOT / "START.EXE")
        self.resident_relocations = resident_public_calls(self.retail, metadata)
        for row in self.resident_relocations:
            source = row["sourceCall"]
            offset, old_segment = struct.unpack_from("<HH", self.retail.image, source + 1)
            expected = b"\x9a" + struct.pack("<HH", offset, old_segment + 0x1000)
            if bytes(self.uc.mem_read(0x10000 + source, 5)) != expected:
                raise AssertionError("Resident source MZ call preimage differs")
            self.uc.mem_write(0x10000 + source,
                              b"\x9a" + struct.pack("<HH", row["procedure"], self.segments[row["descriptor"]]))
        if bitmap_bank4 is None:
            raise ValueError("Bitmap-bank input must be explicit; empty bytes are a null diagnostic only")
        if bitmap_bank4 != b"":
            raise ValueError("Source-owned non-null bitmap factory closure is pending")
        self.bitmap_scope = "explicit null diagnostic, not ordinary graphics parity"
        assert bytes(self.uc.mem_read(PLAYER_DATA + 0x7DFA, 4)) == bytes(4)
        self.uc.mem_write(0, bytes(low_memory))
        self.low_memory = bytes(low_memory)
        self.uc.mem_write(AREA_BASE, bytes(2048))
        self.uc.mem_write(BANK1, bytes(2048))
        self.uc.mem_write(AREA_BASE + 0x3E8, b"\2\0")
        self.uc.mem_write(AREA_BASE + 0x1CC, b"\1\0")
        self.uc.mem_write(PLAYER_DATA + 0x67C6, pointer(AREA_BASE))
        self.uc.mem_write(PLAYER_DATA + 0x67CA, pointer(BANK1))
        self.uc.mem_write(FONT_BASE, original_font())
        self.uc.mem_write(PLAYER_DATA + 0x7DC8, pointer(FONT_BASE))
        for offset in (0x6816, 0x67D6, 0xA602, 0xA64A, 0x67E9):
            self.uc.mem_write(PLAYER_DATA + offset, b"\0")
        self.keys = tuple(keys)
        self.input_index = -1
        self.poll_ready = False
        self.key_read = False
        self.clock_ticks = 0
        self.checkpoint_states = []
        self.trace = deque(maxlen=128)
        self.input_trace = []
        self.locations = {self.location(offset): offset for offset in CHECKPOINTS}
        self.uc.hook_add(UC_HOOK_CODE, self.observe_menu)

    def admit_party(self):
        """Real full25F63 builds membership and increments7F3E per actor."""
        self.load_party()
        self.uc.mem_write(PLAYER_DATA + 0x7D3C, bytes(4))
        for index in range(6):
            self.uc.mem_write(ACTOR_BASE + index * 439 + 413, bytes(4))
            self.call(0x25F63, (index * 439, ACTOR_BASE >> 4), data_base=PLAYER_DATA)
        self.uc.mem_write(PLAYER_DATA + 0x7D38, pointer(ACTOR_BASE))
        assert struct.unpack("<H", self.uc.mem_read(BANK1 + 0x67C, 2))[0] == 6
        return bytes(self.uc.mem_read(ACTOR_BASE, 6 * 439))

    def observe_menu(self, uc, address, size, unused):
        self.trace.append((address, self.reg("DS"), self.reg("ES"), self.reg("SP")))
        if address in self.locations:
            self.checkpoint_states.append({"entry": self.locations[address],
                                          "actors": bytes(uc.mem_read(ACTOR_BASE, 6 * 439)).hex(),
                                          "xpAward": bytes(uc.mem_read(PLAYER_DATA + 0xA4BC, 4)).hex(),
                                          "eligibility": bytes(uc.mem_read(PLAYER_DATA + 0x67F5, 1)).hex()})
        if address == self.location(INPUT):
            self.input_index += 1
            self.poll_ready = False; self.key_read = False
            self.input_trace.append({"index": self.input_index, "entry": INPUT})
            if self.input_index >= len(self.keys):
                raise MissingOriginalInput("Original input helper requires a declared future key")

    def interrupt(self, uc, number, unused):
        ax = self.reg("AX"); ah = ax >> 8
        if number == 0x21 and ah == 0x2C:
            tick = self.clock_ticks; self.clock_ticks += 1
            self.word("CX", 12 << 8); self.word("DX", ((tick // 100) % 60) << 8 | tick % 100)
            self.events.append({"interrupt": number, "ax": ax, "clock": tick})
            return
        if number == 0x16 and ah in (0, 1):
            if self.input_index < 0:
                if ah == 1:
                    # Original file helpers query an idle keyboard; no future
                    # reward key is available before its declared UI entry.
                    return super().interrupt(uc, number, unused)
                raise MissingOriginalInput("BIOS keyboard read outside declared original input boundary")
            ready = self.poll_ready and not self.key_read
            self.events.append({"interrupt": number, "ax": ax, "input": self.input_index, "ready": ready})
            if ah == 1:
                flags = self.reg("EFLAGS")
                uc.reg_write(x86.UC_X86_REG_EFLAGS, flags & ~64 if ready else flags | 64)
                if ready: self.word("AX", self.keys[self.input_index])
                self.poll_ready = True
                return
            if not ready:
                raise MissingOriginalInput("Blocking original BIOS read has no declared available key")
            self.word("AX", self.keys[self.input_index]); self.key_read = True
            return
        return super().interrupt(uc, number, unused)
