from __future__ import annotations

import struct
import tempfile
import unittest
import zlib
from pathlib import Path
from unittest.mock import patch

from tools import dosbox_gamelink


class GameLinkProtocolTests(unittest.TestCase):
    def test_revision_four_offsets_match_packed_upstream_structs(self) -> None:
        self.assertEqual(dosbox_gamelink.FRAME_OFFSET, 342)
        self.assertEqual(dosbox_gamelink.FRAME_BUFFER_OFFSET, 354)
        self.assertEqual(dosbox_gamelink.INPUT_OFFSET, 5_243_234)
        self.assertEqual(dosbox_gamelink.INPUT_READY_OFFSET, 5_243_242)
        self.assertEqual(dosbox_gamelink.INPUT_MOUSE_BUTTON_OFFSET, 5_243_243)
        self.assertEqual(dosbox_gamelink.INPUT_KEY_STATE_OFFSET, 5_243_244)
        self.assertEqual(dosbox_gamelink.SCAN_CODES["enter"], 0x1C)
        self.assertEqual(dosbox_gamelink.SCAN_CODES["up"], 0xC8)
        self.assertEqual(dosbox_gamelink.SCAN_CODES["kp_enter"], 0x9C)
        self.assertEqual(dosbox_gamelink.SCAN_CODES["kp_5"], 0x4C)
        self.assertEqual(dosbox_gamelink.SCAN_CODES["semicolon"], 0x27)
        self.assertEqual(dosbox_gamelink.SCAN_CODES["backslash"], 0x2B)
        self.assertEqual(dosbox_gamelink.PEEK_OFFSET, 5_243_276)
        self.assertEqual(dosbox_gamelink.PEEK_DATA_OFFSET, 5_308_816)
        self.assertEqual(dosbox_gamelink.RAM_SIZE_OFFSET, 5_456_278)
        self.assertEqual(dosbox_gamelink.RAM_DATA_OFFSET, 5_456_282)

    def test_png_writer_converts_bgra_framebuffer_to_rgba(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "frame.png"
            dosbox_gamelink.write_png(output, 2, 1, bytes((0, 0, 255, 255, 0, 255, 0, 255)))
            data = output.read_bytes()

        self.assertTrue(data.startswith(b"\x89PNG\r\n\x1a\n"))
        cursor = 8
        chunks: dict[bytes, bytes] = {}
        while cursor < len(data):
            length = struct.unpack(">I", data[cursor : cursor + 4])[0]
            kind = data[cursor + 4 : cursor + 8]
            chunks[kind] = data[cursor + 8 : cursor + 8 + length]
            cursor += 12 + length
        self.assertEqual(struct.unpack(">II", chunks[b"IHDR"][:8]), (2, 1))
        self.assertEqual(zlib.decompress(chunks[b"IDAT"]), bytes((0, 255, 0, 0, 255, 0, 255, 0, 255)))

    def test_press_supports_modifier_combinations(self) -> None:
        link = dosbox_gamelink.GameLink.__new__(dosbox_gamelink.GameLink)
        transitions: list[tuple[int, bool]] = []
        link._set_key = lambda scan, down: transitions.append((scan, down))
        link._wait_consumed = lambda: None
        link.press("shift+b", hold=0)
        self.assertEqual(
            transitions,
            [(0x2A, True), (0x30, True), (0x30, False), (0x2A, False)],
        )

    def test_press_releases_pressed_keys_when_consumption_times_out(self) -> None:
        link = dosbox_gamelink.GameLink.__new__(dosbox_gamelink.GameLink)
        transitions: list[tuple[int, bool]] = []
        waits = 0
        link._set_key = lambda scan, down: transitions.append((scan, down))

        def wait() -> None:
            nonlocal waits
            waits += 1
            if waits == 1:
                raise TimeoutError("simulated consume timeout")

        link._wait_consumed = wait
        with self.assertRaisesRegex(TimeoutError, "simulated consume timeout"):
            link.press("enter", hold=0)
        self.assertEqual(transitions, [(0x1C, True), (0x1C, False)])

    def test_png_writer_forces_opaque_alpha(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "transparent-source.png"
            dosbox_gamelink.write_png(output, 1, 1, bytes((1, 2, 3, 0)))
            data = output.read_bytes()
        cursor = 8
        chunks: dict[bytes, bytes] = {}
        while cursor < len(data):
            length = struct.unpack(">I", data[cursor : cursor + 4])[0]
            kind = data[cursor + 4 : cursor + 8]
            chunks[kind] = data[cursor + 8 : cursor + 8 + length]
            cursor += 12 + length
        self.assertEqual(zlib.decompress(chunks[b"IDAT"]), bytes((0, 3, 2, 1, 255)))

    def test_mutex_wait_uses_client_timeout_instead_of_infinite_wait(self) -> None:
        link = dosbox_gamelink.GameLink.__new__(dosbox_gamelink.GameLink)
        link.mutex = 123
        link.timeout = 2.5
        with patch.object(dosbox_gamelink.kernel32, "WaitForSingleObject", return_value=dosbox_gamelink.WAIT_TIMEOUT) as wait:
            with self.assertRaisesRegex(TimeoutError, "2.5s acquiring GameLink mutex"):
                link._lock()
        wait.assert_called_once_with(123, 2500)

    def test_mutex_wait_accepts_abandoned_mutex_ownership(self) -> None:
        link = dosbox_gamelink.GameLink.__new__(dosbox_gamelink.GameLink)
        link.mutex = 456
        link.timeout = 1.0
        with patch.object(
            dosbox_gamelink.kernel32,
            "WaitForSingleObject",
            return_value=dosbox_gamelink.WAIT_ABANDONED_0,
        ):
            link._lock()

    def test_poke_requires_expected_bytes_and_verifies_replacement(self) -> None:
        link = dosbox_gamelink.GameLink.__new__(dosbox_gamelink.GameLink)
        memory = bytearray(dosbox_gamelink.RAM_DATA_OFFSET + 8)
        memory[dosbox_gamelink.RAM_SIZE_OFFSET : dosbox_gamelink.RAM_SIZE_OFFSET + 4] = struct.pack("<I", 8)
        memory[dosbox_gamelink.RAM_DATA_OFFSET + 2 : dosbox_gamelink.RAM_DATA_OFFSET + 4] = b"\x11\x22"
        link._lock = lambda: None
        link._unlock = lambda: None
        link._read = lambda offset, size: bytes(memory[offset : offset + size])
        link._write = lambda offset, data: memory.__setitem__(slice(offset, offset + len(data)), data)

        self.assertEqual(link.poke(2, b"\x11\x22", b"\x33\x44"), b"\x11\x22")
        self.assertEqual(memory[dosbox_gamelink.RAM_DATA_OFFSET + 2 : dosbox_gamelink.RAM_DATA_OFFSET + 4], b"\x33\x44")
        with self.assertRaisesRegex(RuntimeError, "expectation failed"):
            link.poke(2, b"\x11\x22", b"\x55\x66")


class GameLinkOpenDiagnosticsTests(unittest.TestCase):
    def _one_open_attempt(self):
        return (
            patch.object(dosbox_gamelink.time, "monotonic", side_effect=[0.0, 0.1, 0.6]),
            patch.object(dosbox_gamelink.time, "sleep"),
            patch.object(dosbox_gamelink.kernel32, "CloseHandle"),
        )

    def test_mapping_open_failure_reports_name_and_win32_error(self) -> None:
        monotonic, sleep, close_handle = self._one_open_attempt()
        with monotonic, sleep, close_handle:
            with patch.object(dosbox_gamelink.kernel32, "OpenFileMappingW", return_value=None), \
                 patch.object(dosbox_gamelink.kernel32, "OpenMutexW", return_value=123), \
                 patch.object(dosbox_gamelink.ctypes, "get_last_error", return_value=2):
                with self.assertRaises(RuntimeError) as raised:
                    dosbox_gamelink.GameLink(timeout=0.5)

        message = str(raised.exception)
        self.assertIn("OpenFileMappingW 'DWD_GAMELINK_MMAP_R4'", message)
        self.assertIn("Win32 error 2", message)
        self.assertIn("OpenMutexW 'DWD_GAMELINK_MUTEX_R4' opened on the last attempt", message)
        self.assertIn("frame sequence unavailable", message)

    def test_mutex_open_failure_reports_name_and_win32_error(self) -> None:
        monotonic, sleep, close_handle = self._one_open_attempt()
        with monotonic, sleep, close_handle:
            with patch.object(dosbox_gamelink.kernel32, "OpenFileMappingW", return_value=123), \
                 patch.object(dosbox_gamelink.kernel32, "OpenMutexW", return_value=None), \
                 patch.object(dosbox_gamelink.ctypes, "get_last_error", return_value=5):
                with self.assertRaises(RuntimeError) as raised:
                    dosbox_gamelink.GameLink(timeout=0.5)

        message = str(raised.exception)
        self.assertIn("OpenFileMappingW 'DWD_GAMELINK_MMAP_R4' opened on the last attempt", message)
        self.assertIn("OpenMutexW 'DWD_GAMELINK_MUTEX_R4'", message)
        self.assertIn("Win32 error 5", message)
        self.assertIn("frame sequence unavailable", message)


if __name__ == "__main__":
    unittest.main()
