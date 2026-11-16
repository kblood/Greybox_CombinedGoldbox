"""Original Secret pending-reward handlers, with declared DOS transport only.

Stage1 scaffold: original CLEAR_MONSTERS and fixed TREASURE execute unchanged.
Collection/recipient/empty-COMBAT closure is not yet established. No native
reward behavior or actor payout is implemented by this module.
"""
from dataclasses import dataclass
import hashlib
import struct

from unicorn import UC_HOOK_CODE, UC_HOOK_MEM_WRITE
from unicorn import x86_const as x86

from tools.secret_melee_oracle import ACTOR_BASE, DEFAULT_ROOT, STACK_BASE, RETURN, load, pointer
from tools.secret_player_oracle import PLAYER_DATA, PlayerMachine
from tools.secret_who_oracle import SCRIPT_BASE, AREA_BASE

CLEAR_MONSTERS = 0x1F1F
TREASURE = 0x2A48
COMBAT = 0x266B
POOL = 0x87AC
ITEM_HEAD = 0x87C8
ALLOCATE = 0x10000 + 0xC5D0 + 0x329
FREE = 0x10000 + 0xC5D0 + 0x341
RESOURCE_READ = 0x10000 + 0x6400 + 0x900
ITEM_ARCHIVE_SHA = "6c6cb5eadbf6f8f85bb329c9a28f991978370e0d3c76570939421cd516a616c6"


class OriginalProcessExit(AssertionError):
    """Actual DOS termination is not a successful helper return."""


@dataclass(frozen=True)
class PendingResult:
    pools: tuple[int, ...]
    nodes: tuple[bytes, ...]
    pc: int
    data_changes: frozenset[int]
    writes: tuple[tuple[int, int, int], ...]
    visited: frozenset[int]
    events: tuple[dict, ...]
    allocations: tuple[int, ...]
    frees: tuple[int, ...]
    seed: int
    comparison: bytes


class TreasureMachine(PlayerMachine):
    def __init__(self, retail=None, *, archive=None, poison=False, sound_mode=None,
                 players=False, heap_psp_end=0x4F00):
        files = {path.name: path.read_bytes() for slot in range(1, 7)
                 for extension in ("SAV", "STF", "SFX")
                 for path in (DEFAULT_ROOT / f"CHRDATA{slot}.{extension}",)
                 if players and path.is_file()}
        super().__init__(retail or load(), files, poison=poison, video_safe=True)
        if heap_psp_end not in (0x4F00, 0x5000, 0x5F00):
            raise ValueError("Proven disjoint layout or preserved collision control required")
        # Parent's single-actor fixture uses5F00, whose free-table5EFF8 overlaps
        # our call stack. Re-execute ORIGINAL startup before any allocation,
        # using declared PSP4F00; never reset an allocated/live party heap.
        self.uc.mem_write(0x2F002, struct.pack("<H", heap_psp_end))
        for name, value in (("CS", 0x1C5D), ("SS", 0x3000), ("SP", 0xE000), ("ES", 0x2F00)):
            self.uc.reg_write(getattr(x86, "UC_X86_REG_" + name), value)
        self.uc.emu_start(0x1C5D0, 0x1C605, count=100)
        assert (self.uc.reg_read(x86.UC_X86_REG_CS) << 4) + self.uc.reg_read(x86.UC_X86_REG_IP) == 0x1C605
        self.heap_psp_end = heap_psp_end
        self.table_segment = struct.unpack("<H", self.uc.mem_read(PLAYER_DATA + 0x5984, 2))[0]
        self.first_hole_entry = (self.table_segment << 4) + 0xFFF8
        assert self.first_hole_entry == {0x4F00: 0x4EFF8, 0x5000: 0x4FFF8, 0x5F00: 0x5EFF8}[heap_psp_end]
        if heap_psp_end in (0x4F00, 0x5000):
            assert self.first_hole_entry < STACK_BASE
        # The same original Pascal file services/decoder operate on immutable
        # declared bytes; only the DOS basename allowlist gains ITEM1.DAX.
        raw = (DEFAULT_ROOT / "ITEM1.DAX").read_bytes() if archive is None else bytes(archive)
        if archive is None and hashlib.sha256(raw).hexdigest() != ITEM_ARCHIVE_SHA:
            raise ValueError("Held original ITEM1.DAX changed")
        self.files["ITEM1.DAX"] = raw
        self.uc.mem_write(PLAYER_DATA + 0x7420, b"\1")
        self.writes = []
        self.allocations = []
        self.frees = []
        self.allocation_returns = []
        self.pending_allocations = []
        self.uc.hook_add(UC_HOOK_CODE, self.observe)
        self.uc.hook_add(UC_HOOK_MEM_WRITE, self.record_write)
        self.sound_mode = sound_mode
        if sound_mode is not None:
            if sound_mode not in (2, 3, 4, 5):
                raise ValueError("Original configured sound selector required")
            self.uc.mem_write(PLAYER_DATA + 0x741A, bytes([sound_mode]))
            # Real resident sound startup. Mode5 is the source menu's Silent
            # option; it is explicitly different from held BLADES.CFG AdLib.
            self.call_resident(0x7F0B, 0x7E4, ())

    def load_party(self):
        """Original loose-SAV loader/recalc for six actors, then declared list.

        This is the established explicit-import fixture, not original saved
        party restoration. Original heap pointers to STF/SFX stay attached.
        """
        retained = {}
        for index in range(6):
            offset = index * 439
            name = f"CHRDATA{index + 1}.SAV".encode()
            self.uc.mem_write(ACTOR_BASE + 0x1000, bytes([len(name)]) + name)
            self.call(0x255D8, (1, 0, offset, ACTOR_BASE >> 4, 0x1000, ACTOR_BASE >> 4), data_base=PLAYER_DATA)
            self.call(0x3A292, (offset, ACTOR_BASE >> 4), data_base=PLAYER_DATA)
            assert not self.handles
            assert all(bytes(self.uc.mem_read(address, len(raw))) == raw for address, raw in retained.items())
            actor = bytearray(self.uc.mem_read(ACTOR_BASE + offset, 439))
            retained[ACTOR_BASE + offset] = bytes(actor)
            for head, width, link in ((actor[251:255], 9, 5), (actor[353:357], 67, 42)):
                while head != bytes(4):
                    lo, segment = struct.unpack("<HH", head)
                    address = (segment << 4) + lo
                    raw = bytes(self.uc.mem_read(address, width))
                    retained[address] = raw
                    head = raw[link:link + 4]
        for index in range(6):
            actor = bytearray(self.uc.mem_read(ACTOR_BASE + index * 439, 439))
            actor[413:417] = pointer(ACTOR_BASE + (index + 1) * 439 if index < 5 else 0)
            self.uc.mem_write(ACTOR_BASE + index * 439, bytes(actor))
        self.uc.mem_write(PLAYER_DATA + 0x7D38, pointer(ACTOR_BASE))
        self.uc.mem_write(PLAYER_DATA + 0x7D3C, pointer(ACTOR_BASE))
        return bytes(self.uc.mem_read(ACTOR_BASE, 6 * 439))

    def call_resident(self, image_offset, original_segment, args):
        segment = 0x1000 + original_segment
        for name, value in (("CS", segment), ("DS", PLAYER_DATA >> 4),
                            ("ES", PLAYER_DATA >> 4), ("SS", STACK_BASE >> 4),
                            ("SP", 0xF000), ("BP", 0), ("EFLAGS", 2)):
            self.uc.reg_write(getattr(x86, "UC_X86_REG_" + name), value)
        self.uc.mem_write(STACK_BASE + 0xF000, struct.pack("<HH", 0, RETURN >> 4) +
                          b"".join(struct.pack("<H", arg) for arg in args))
        self.uc.emu_start(0x10000 + image_offset, RETURN, count=500000, timeout=5_000_000)
        final = (self.reg("CS") << 4) + self.reg("IP")
        if final != RETURN or self.unmapped or self.reg("SP") != 0xF004 + len(args) * 2:
            raise AssertionError("Original resident dependency did not return with its full stack")

    def observe(self, uc, address, size, unused):
        if self.pending_allocations and address == self.pending_allocations[-1]["return"]:
            event = self.pending_allocations.pop()
            event["address"] = (self.reg("DX") << 4) + self.reg("AX")
            offset = struct.unpack("<H", uc.mem_read(PLAYER_DATA + 0x5982, 2))[0]
            event["metadataStart"] = (self.table_segment << 4) + min(offset or 0xFFF8, 0xFFF8)
            event["ownershipValid"] = 0x45390 <= event["address"] < event["address"] + event["bytes"] <= event["metadataStart"]
            # Explicit old5F00 diagnostic retains invalid returns so the
            # unchanged original allocator reaches its actual status204 exit.
            # The supported4F00 fixture always enforces full ownership.
            if self.heap_psp_end in (0x4F00, 0x5000) and not event["ownershipValid"]:
                raise AssertionError("Original allocation overlaps metadata or escapes declared heap")
            self.allocation_returns.append(event)
        if address in (ALLOCATE, FREE):
            stack = (self.reg("SS") << 4) + self.reg("SP")
            width = struct.unpack("<H", uc.mem_read(stack + 4, 2))[0]
            (self.allocations if address == ALLOCATE else self.frees).append(width)
            if address == ALLOCATE:
                ip, cs = struct.unpack("<HH", uc.mem_read(stack, 4))
                self.pending_allocations.append({"return": (cs << 4) + ip, "bytes": width})

    def record_write(self, uc, access, address, size, value, unused):
        self.writes.append((address, size, value))

    def interrupt(self, uc, number, unused):
        ax = self.reg("AX")
        if number == 0x21 and ax >> 8 == 0x25:
            vector = ax & 255
            old = bytes(uc.mem_read(vector * 4, 4))
            replacement = struct.pack("<HH", self.reg("DX"), self.reg("DS"))
            uc.mem_write(vector * 4, replacement)
            self.events.append({"interrupt": number, "ax": ax, "vector": vector,
                                "offset": self.reg("DX"), "segment": self.reg("DS"),
                                "oldIVT": old.hex(), "newIVT": bytes(uc.mem_read(vector * 4, 4)).hex(),
                                "caller": (self.reg("CS") << 4) + self.reg("IP")})
            return
        if number == 0x21 and ax >> 8 == 0x06 and self.reg("DX") & 255 != 255:
            char = self.reg("DX") & 255
            self.events.append({"interrupt": number, "ax": ax, "consoleByte": char})
            self.word("AX", (ax & 0xFF00) | char)
            return
        if number == 0x21 and ax >> 8 == 0x40 and self.reg("BX") in (1, 2):
            address = (self.reg("DS") << 4) + self.reg("DX")
            data = bytes(uc.mem_read(address, self.reg("CX")))
            self.events.append({"interrupt": number, "ax": ax, "console": data.hex(),
                                "handle": self.reg("BX")})
            self.word("AX", len(data)); self.carry(False)
            return
        if number == 0x21 and ax >> 8 == 0x4C:
            self.events.append({"interrupt": number, "ax": ax, "exit": ax & 255})
            raise OriginalProcessExit(f"Original guest terminated with DOS status {ax & 255}")
        if number == 0x21 and ax >> 8 in (0x4E, 0x3D):
            address = (self.reg("DS") << 4) + self.reg("DX")
            raw = bytes(uc.mem_read(address, 128))
            if b"\0" not in raw:
                raise AssertionError("Unterminated original resource DOS filename")
            name = raw.split(b"\0", 1)[0].decode("ascii")
            if name.upper() == "ITEM1.DAX":
                # Original archive loader uses a relative basename. The
                # declared DOS CWD owns this exact one immutable resource;
                # no guest filename/pointer or loader helper is rewritten.
                data = self.files["ITEM1.DAX"]
                self.events.append({"interrupt": number, "ax": ax,
                                    "path": name, "cwd": "C:\\IMPORT",
                                    "size": len(data)})
                if ax >> 8 == 0x4E:
                    if not self.dta:
                        raise AssertionError("Resource FindFirst lacks original DTA setup")
                    dta = bytearray(43)
                    struct.pack_into("<I", dta, 26, len(data))
                    dta[30:39] = b"ITEM1.DAX"
                    uc.mem_write(self.dta, bytes(dta))
                else:
                    handle = self.next_handle; self.next_handle += 1
                    self.handles[handle] = [data, 0, name]
                    self.word("AX", handle)
                self.carry(False)
                return
        return super().interrupt(uc, number, unused)

    def execute(self, entry, instruction, *, pc=0x8000, seed=0x1234):
        """Complete original handler call; no helper return is substituted."""
        if entry not in (CLEAR_MONSTERS, TREASURE, COMBAT):
            raise ValueError("Declared original reward-path entry required")
        if not 0x8000 <= pc < 0x9F00 or not instruction:
            raise ValueError("Bounded explicit original instruction required")
        self.uc.mem_write(SCRIPT_BASE + pc - 0x8000, bytes(instruction))
        self.uc.mem_write(PLAYER_DATA + 0x67D2, pointer(SCRIPT_BASE))
        self.uc.mem_write(PLAYER_DATA + 0x67C6, pointer(AREA_BASE))
        self.uc.mem_write(PLAYER_DATA + 0x67E1, struct.pack("<H", pc))
        self.uc.mem_write(PLAYER_DATA + 0x8F63, instruction[:1])
        self.uc.mem_write(PLAYER_DATA + 0x599C, struct.pack("<I", seed))
        self.uc.mem_write(PLAYER_DATA + 0x8DC7, b"\1")
        before = bytes(self.uc.mem_read(PLAYER_DATA, 65536))
        code_before = tuple(bytes(self.uc.mem_read(lo, hi - lo)) for lo, hi in self.code_ranges)
        self.writes.clear(); self.events.clear(); self.visited.clear()
        self.allocations.clear(); self.frees.clear()
        self.call(entry, (), data_base=PLAYER_DATA, seed=seed)
        if self.reg("SP") != 0xF004 or self.handles:
            raise AssertionError("Original reward handler left stack/files unbalanced")
        after = bytes(self.uc.mem_read(PLAYER_DATA, 65536))
        if code_before != tuple(bytes(self.uc.mem_read(lo, hi - lo)) for lo, hi in self.code_ranges):
            raise AssertionError("Original reward path changed instruction storage")
        return PendingResult(struct.unpack_from("<7I", after, POOL),
                             self.nodes(after[ITEM_HEAD:ITEM_HEAD + 4], 67, 42),
                             struct.unpack_from("<H", after, 0x67E1)[0],
                             frozenset(i for i, (a, b) in enumerate(zip(before, after)) if a != b),
                             tuple(self.writes), frozenset(self.visited), tuple(self.events),
                             tuple(self.allocations), tuple(self.frees),
                             struct.unpack_from("<I", after, 0x599C)[0], after[0x8F5C:0x8F62])
