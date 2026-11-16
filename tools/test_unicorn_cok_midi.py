from __future__ import annotations

import struct
import tempfile
import unittest
from pathlib import Path

import unicorn
from unicorn import Uc, UC_ARCH_X86, UC_HOOK_CODE, UC_HOOK_INTR, UC_MODE_16
from unicorn.x86_const import (
    UC_X86_REG_AX,
    UC_X86_REG_CS,
    UC_X86_REG_CX,
    UC_X86_REG_DS,
    UC_X86_REG_DX,
    UC_X86_REG_EFLAGS,
    UC_X86_REG_IP,
    UC_X86_REG_SP,
    UC_X86_REG_SS,
)

from tools import unicorn_cok_midi


class CokInterruptDispatchTests(unittest.TestCase):
    def test_int3f_iret_round_trip_preserves_return_state(self) -> None:
        tracer = unicorn_cok_midi.CokMidiTracer.__new__(unicorn_cok_midi.CokMidiTracer)
        tracer.int_vectors = {0x3F: (0x3000, 0x0020)}
        tracer.log_lines = []
        tracer.verbose = False
        tracer.instr_count = 7

        uc = Uc(UC_ARCH_X86, UC_MODE_16)
        uc.mem_map(0, 0x70000)
        code_segment, code_offset = 0x2000, 0x0100
        handler_segment, handler_offset = 0x3000, 0x0020
        stack_segment, initial_sp = 0x4567, 0x8000
        uc.mem_write(code_segment * 16 + code_offset, b"\xcd\x3f\x90\xeb\xfe")
        uc.mem_write(handler_segment * 16 + handler_offset, b"\xcf")  # iret
        uc.reg_write(UC_X86_REG_CS, code_segment)
        uc.reg_write(UC_X86_REG_IP, code_offset)
        uc.reg_write(UC_X86_REG_SS, stack_segment)
        uc.reg_write(UC_X86_REG_SP, initial_sp)
        original_flags = 0x0347  # distinct low flags, including IF and TF
        uc.reg_write(UC_X86_REG_EFLAGS, original_flags)

        handler_state: list[tuple[int, int, int, int, bytes]] = []
        return_markers: list[tuple[int, int]] = []

        def observe(emu: Uc, address: int, _size: int, _user_data: object) -> None:
            cs = emu.reg_read(UC_X86_REG_CS)
            ip = emu.reg_read(UC_X86_REG_IP)
            if (cs, ip) == (handler_segment, handler_offset):
                ss = emu.reg_read(UC_X86_REG_SS)
                sp = emu.reg_read(UC_X86_REG_SP)
                handler_state.append((cs, ip, ss, sp, bytes(emu.mem_read(ss * 16 + sp, 6))))
                handler_flags = emu.reg_read(UC_X86_REG_EFLAGS)
                self.assertEqual(handler_flags & (unicorn_cok_midi.IF | unicorn_cok_midi.TF), 0)
            elif (cs, ip) == (code_segment, code_offset + 2):
                return_markers.append((cs, ip))
                emu.emu_stop()

        uc.hook_add(UC_HOOK_INTR, tracer._on_intr)
        uc.hook_add(UC_HOOK_CODE, observe)
        uc.emu_start(code_segment * 16 + code_offset, 0, count=20)

        self.assertEqual(len(handler_state), 1)
        self.assertEqual(
            handler_state[0],
            (
                handler_segment,
                handler_offset,
                stack_segment,
                initial_sp - 6,
                struct.pack("<HHH", code_offset + 2, code_segment, original_flags),
            ),
        )
        self.assertEqual(return_markers, [(code_segment, code_offset + 2)])
        self.assertEqual((uc.reg_read(UC_X86_REG_CS), uc.reg_read(UC_X86_REG_IP)),
                         (code_segment, code_offset + 2))
        self.assertEqual((uc.reg_read(UC_X86_REG_SS), uc.reg_read(UC_X86_REG_SP)),
                         (stack_segment, initial_sp))
        self.assertEqual(uc.reg_read(UC_X86_REG_EFLAGS) & 0xFFFF, original_flags)


class CokFindFirstTests(unittest.TestCase):
    def test_directory_match_requires_directory_attribute_and_sets_dta_attribute(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "SAVE").mkdir()
            tracer = unicorn_cok_midi.CokMidiTracer.__new__(unicorn_cok_midi.CokMidiTracer)
            tracer.root = str(root)
            tracer._SEARCH_SUBDIRS = (".",)
            tracer.dta_seg = 0
            tracer.dta_off = 0x0200
            tracer.instr_count = 1
            tracer.log_lines = []
            tracer.verbose = False
            tracer._find_search = None

            class MemoryUc:
                def __init__(self) -> None:
                    self.regs = {UC_X86_REG_EFLAGS: 0}
                    self.memory = bytearray(0x10000)

                def reg_read(self, register: int) -> int:
                    return self.regs.get(register, 0)

                def reg_write(self, register: int, value: int) -> None:
                    self.regs[register] = value

                def mem_read(self, address: int, size: int) -> bytes:
                    return bytes(self.memory[address:address + size])

                def mem_write(self, address: int, data: bytes) -> None:
                    self.memory[address:address + len(data)] = data

            uc = MemoryUc()
            uc.mem_write(0x0100, b"C:\\SAVE\x00")
            uc.reg_write(UC_X86_REG_DS, 0)
            uc.reg_write(UC_X86_REG_DX, 0x0100)

            uc.reg_write(UC_X86_REG_CX, 0)
            tracer._on_findfirst_next(uc, 0x4E)
            self.assertNotEqual(uc.reg_read(UC_X86_REG_EFLAGS) & unicorn_cok_midi.CF, 0)

            uc.reg_write(UC_X86_REG_CX, 0x10)
            tracer._on_findfirst_next(uc, 0x4E)
            self.assertEqual(uc.reg_read(UC_X86_REG_AX), 0)
            self.assertEqual(uc.reg_read(UC_X86_REG_EFLAGS) & unicorn_cok_midi.CF, 0)
            self.assertEqual(uc.mem_read(0x0200 + 0x15, 1)[0], 0x10)
            self.assertEqual(bytes(uc.mem_read(0x0200 + 0x1E, 5)), b"SAVE\x00")


if __name__ == "__main__":
    unittest.main()
