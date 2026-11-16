from __future__ import annotations

import struct
import tempfile
import unittest
from pathlib import Path

import unicorn
from unicorn import Uc, UC_ARCH_X86, UC_MODE_16
from unicorn.x86_const import (
    UC_X86_REG_CS,
    UC_X86_REG_CX,
    UC_X86_REG_DS,
    UC_X86_REG_DX,
    UC_X86_REG_EFLAGS,
    UC_X86_REG_IP,
    UC_X86_REG_SP,
    UC_X86_REG_SS,
)

from tools import unicorn_gateway_pic


class GatewayPeriodicTimerTests(unittest.TestCase):
    def make_tracer(self) -> unicorn_gateway_pic.GatewayPicTracer:
        tracer = unicorn_gateway_pic.GatewayPicTracer.__new__(unicorn_gateway_pic.GatewayPicTracer)
        tracer.timer_irq_interval = 1200
        tracer.next_timer_irq_instr = 1200
        tracer.timer_irq_count = 0
        tracer.timer_int1c_count = 0
        tracer.timer_irq_vector_ready_checks = 0
        tracer.timer_irq_if_blocked_checks = 0
        tracer.instr_count = 1200
        tracer.int_vectors = {0x08: (0x0200, 0x0000)}
        tracer.initial_int_vectors = {0x08: (0x0062, 0x0000), 0x1C: (0x0067, 0x0000)}
        tracer.log_lines = []
        tracer.verbose = False
        return tracer

    def test_irq0_pushes_real_frame_clears_if_and_returns_via_iret(self) -> None:
        tracer = self.make_tracer()
        uc = Uc(UC_ARCH_X86, UC_MODE_16)
        uc.mem_map(0, 0x10000)
        uc.mem_write(0x2000, b"\xff\x06\x00\x30\xcf")  # inc word ptr [0x3000]; iret
        uc.mem_write(0x3000, b"\x00\x00")
        uc.mem_write(0x08 * 4, struct.pack("<HH", 0, 0x0200))
        uc.reg_write(UC_X86_REG_CS, 0)
        uc.reg_write(UC_X86_REG_IP, 0x1000)
        uc.reg_write(UC_X86_REG_DS, 0)
        uc.reg_write(UC_X86_REG_SS, 0)
        uc.reg_write(UC_X86_REG_SP, 0x9000)
        original_flags = unicorn_gateway_pic.IF | 0x0044
        uc.reg_write(UC_X86_REG_EFLAGS, original_flags)
        stacked_flags = uc.reg_read(UC_X86_REG_EFLAGS) & 0xFFFF

        self.assertTrue(tracer._inject_timer_irq(uc))
        self.assertEqual(tracer.timer_irq_count, 1)
        self.assertEqual(tracer.timer_int1c_count, 0)
        self.assertEqual(tracer.timer_irq_vector_ready_checks, 1)
        self.assertEqual(tracer.timer_irq_if_blocked_checks, 0)
        self.assertEqual((uc.reg_read(UC_X86_REG_CS), uc.reg_read(UC_X86_REG_IP)), (0x0200, 0))
        self.assertEqual(uc.reg_read(UC_X86_REG_SP), 0x8FFA)
        self.assertEqual(
            bytes(uc.mem_read(0x8FFA, 6)),
            struct.pack("<HHH", 0x1000, 0, stacked_flags),
        )
        self.assertEqual(uc.reg_read(UC_X86_REG_EFLAGS) & unicorn_gateway_pic.IF, 0)

        uc.emu_start(0x2000, 0x1000, count=3)
        self.assertEqual(struct.unpack("<H", bytes(uc.mem_read(0x3000, 2)))[0], 1)
        self.assertEqual((uc.reg_read(UC_X86_REG_CS), uc.reg_read(UC_X86_REG_IP)), (0, 0x1000))
        self.assertEqual(uc.reg_read(UC_X86_REG_SP), 0x9000)
        self.assertNotEqual(uc.reg_read(UC_X86_REG_EFLAGS) & unicorn_gateway_pic.IF, 0)

    def test_irq0_waits_for_if_and_an_installed_vector(self) -> None:
        tracer = self.make_tracer()
        uc = Uc(UC_ARCH_X86, UC_MODE_16)
        uc.mem_map(0, 0x10000)
        uc.reg_write(UC_X86_REG_EFLAGS, 0)
        self.assertFalse(tracer._inject_timer_irq(uc))
        self.assertEqual(tracer.next_timer_irq_instr, 1200)
        self.assertEqual(tracer.timer_irq_vector_ready_checks, 1)
        self.assertEqual(tracer.timer_irq_if_blocked_checks, 1)

        uc.reg_write(UC_X86_REG_EFLAGS, unicorn_gateway_pic.IF)
        tracer.int_vectors.clear()
        uc.mem_write(0x08 * 4, struct.pack("<HH", 0, 0x0062))
        uc.mem_write(0x1C * 4, struct.pack("<HH", 0, 0x0067))
        self.assertFalse(tracer._inject_timer_irq(uc))
        self.assertEqual(tracer.next_timer_irq_instr, 2400)
        self.assertEqual(tracer.timer_irq_vector_ready_checks, 1)

    def test_default_irq0_services_installed_int1c_hook_and_advances_bios_tick(self) -> None:
        tracer = self.make_tracer()
        uc = Uc(UC_ARCH_X86, UC_MODE_16)
        uc.mem_map(0, 0x10000)
        uc.mem_write(0x2000, b"\xff\x06\x00\x30\xcf")  # inc word ptr [0x3000]; iret
        uc.mem_write(0x3000, b"\x00\x00")
        uc.mem_write(tracer.BIOS_TICK_PHYS, struct.pack("<I", 41))
        uc.mem_write(0x08 * 4, struct.pack("<HH", 0, 0x0062))
        uc.mem_write(0x1C * 4, struct.pack("<HH", 0, 0x0200))
        uc.reg_write(UC_X86_REG_CS, 0)
        uc.reg_write(UC_X86_REG_IP, 0x1000)
        uc.reg_write(UC_X86_REG_DS, 0)
        uc.reg_write(UC_X86_REG_SS, 0)
        uc.reg_write(UC_X86_REG_SP, 0x9000)
        uc.reg_write(UC_X86_REG_EFLAGS, unicorn_gateway_pic.IF)

        self.assertTrue(tracer._inject_timer_irq(uc))
        self.assertEqual(tracer.timer_irq_count, 0)
        self.assertEqual(tracer.timer_int1c_count, 1)
        self.assertEqual(struct.unpack("<I", bytes(uc.mem_read(tracer.BIOS_TICK_PHYS, 4)))[0], 42)
        self.assertEqual((uc.reg_read(UC_X86_REG_CS), uc.reg_read(UC_X86_REG_IP)), (0x0200, 0))

        uc.emu_start(0x2000, 0x1000, count=3)
        self.assertEqual(struct.unpack("<H", bytes(uc.mem_read(0x3000, 2)))[0], 1)
        self.assertEqual((uc.reg_read(UC_X86_REG_CS), uc.reg_read(UC_X86_REG_IP)), (0, 0x1000))


class GatewayFindFirstTests(unittest.TestCase):
    def test_directory_requires_directory_attribute_and_sets_dta_attribute(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "SAVE").mkdir()
            tracer = unicorn_gateway_pic.GatewayPicTracer.__new__(unicorn_gateway_pic.GatewayPicTracer)
            tracer.root = str(root)
            tracer.dta_seg = 0
            tracer.dta_off = 0x0200
            tracer.instr_count = 1
            tracer.log_lines = []
            tracer.verbose = False

            uc = Uc(UC_ARCH_X86, UC_MODE_16)
            uc.mem_map(0, 0x10000)
            uc.mem_write(0x0100, b"C:\\SAVE\x00")
            uc.reg_write(UC_X86_REG_DS, 0)
            uc.reg_write(UC_X86_REG_DX, 0x0100)
            uc.reg_write(UC_X86_REG_CX, 0)
            tracer._do_findfirst_next(uc, 0x4E, 0)
            self.assertNotEqual(uc.reg_read(UC_X86_REG_EFLAGS) & unicorn_gateway_pic.CF, 0)

            uc.reg_write(UC_X86_REG_CX, 0x10)
            tracer._do_findfirst_next(uc, 0x4E, 0)
            self.assertEqual(uc.reg_read(UC_X86_REG_EFLAGS) & unicorn_gateway_pic.CF, 0)
            self.assertEqual(uc.mem_read(0x0200 + 21, 1)[0], 0x10)
            self.assertEqual(bytes(uc.mem_read(0x0200 + 30, 5)), b"SAVE\x00")


class GatewayPicLoaderSignatureTests(unittest.TestCase):
    def test_exact_signature_rejects_reused_overlay_window(self) -> None:
        tracer = unicorn_gateway_pic.GatewayPicTracer.__new__(unicorn_gateway_pic.GatewayPicTracer)
        tracer.loader_live_phys = 0x1000
        uc = Uc(UC_ARCH_X86, UC_MODE_16)
        uc.mem_map(0, 0x10000)
        uc.mem_write(0x1000, unicorn_gateway_pic.PIC_LOADER_ENTRY_PREFIX)
        uc.mem_write(0x1000 + 0x0B, unicorn_gateway_pic.PIC_LOADER_ENTRY_SUFFIX)
        uc.mem_write(0x1000 + 0x49E, unicorn_gateway_pic.PIC_LOADER_RETURN_SIGNATURE)
        self.assertTrue(tracer._pic_loader_signature_matches(uc))

        uc.mem_write(0x1000, b"\x90")
        self.assertFalse(tracer._pic_loader_signature_matches(uc))


if __name__ == "__main__":
    unittest.main()
