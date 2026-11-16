#!/usr/bin/env python3
"""Control DOSBox-X through its GameLink v4 shared-memory protocol on Windows."""

from __future__ import annotations

import argparse
import ctypes
import json
import struct
import sys
import time
import zlib
from pathlib import Path


MAPPING_NAME = "DWD_GAMELINK_MMAP_R4"
MUTEX_NAME = "DWD_GAMELINK_MUTEX_R4"
FILE_MAP_ALL_ACCESS = 0xF001F
SYNCHRONIZE = 0x00100000
MUTEX_MODIFY_STATE = 0x0001
WAIT_OBJECT_0 = 0
WAIT_ABANDONED_0 = 0x80
WAIT_TIMEOUT = 0x102

FRAME_MAX_WIDTH = 1280
FRAME_MAX_HEIGHT = 1024
FRAME_PAYLOAD = FRAME_MAX_WIDTH * FRAME_MAX_HEIGHT * 4
HEADER_SIZE = 1 + 1 + 64 + 260 + 16
FRAME_HEADER_SIZE = 12
FRAME_OFFSET = HEADER_SIZE
FRAME_BUFFER_OFFSET = FRAME_OFFSET + FRAME_HEADER_SIZE
INPUT_OFFSET = FRAME_BUFFER_OFFSET + FRAME_PAYLOAD
INPUT_READY_OFFSET = INPUT_OFFSET + 8
INPUT_MOUSE_BUTTON_OFFSET = INPUT_OFFSET + 9
INPUT_KEY_STATE_OFFSET = INPUT_OFFSET + 10
PEEK_OFFSET = INPUT_OFFSET + 42
PEEK_LIMIT = 16 * 1024
PEEK_ADDRESS_OFFSET = PEEK_OFFSET + 4
PEEK_DATA_OFFSET = PEEK_ADDRESS_OFFSET + PEEK_LIMIT * 4
BUFFER_RECORD_SIZE = 2 + 64 * 1024
RAM_SIZE_OFFSET = PEEK_DATA_OFFSET + PEEK_LIMIT + BUFFER_RECORD_SIZE * 2 + 2
RAM_DATA_OFFSET = RAM_SIZE_OFFSET + 4

SCAN_CODES = {
    "backspace": 0x0E,
    "esc": 0x01,
    "shift": 0x2A,
    "ctrl": 0x1D,
    "alt": 0x38,
    "enter": 0x1C,
    "space": 0x39,
    "semicolon": 0x27,
    "backslash": 0x2B,
    "kp_enter": 0x9C,
    "kp_0": 0x52,
    "kp_1": 0x4F,
    "kp_2": 0x50,
    "kp_3": 0x51,
    "kp_4": 0x4B,
    "kp_5": 0x4C,
    "kp_6": 0x4D,
    "kp_7": 0x47,
    "kp_8": 0x48,
    "kp_9": 0x49,
    "kp_period": 0x53,
    "insert": 0xD2,
    "up": 0xC8,
    "left": 0xCB,
    "right": 0xCD,
    "down": 0xD0,
}
for index, key in enumerate("1234567890", start=0x02):
    SCAN_CODES[key] = index
for key, scan in zip("qwertyuiop", range(0x10, 0x1A)):
    SCAN_CODES[key] = scan
for key, scan in zip("asdfghjkl", range(0x1E, 0x27)):
    SCAN_CODES[key] = scan
for key, scan in zip("zxcvbnm", range(0x2C, 0x33)):
    SCAN_CODES[key] = scan


kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
kernel32.OpenFileMappingW.argtypes = [ctypes.c_uint32, ctypes.c_int, ctypes.c_wchar_p]
kernel32.OpenFileMappingW.restype = ctypes.c_void_p
kernel32.MapViewOfFile.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_size_t]
kernel32.MapViewOfFile.restype = ctypes.c_void_p
kernel32.UnmapViewOfFile.argtypes = [ctypes.c_void_p]
kernel32.OpenMutexW.argtypes = [ctypes.c_uint32, ctypes.c_int, ctypes.c_wchar_p]
kernel32.OpenMutexW.restype = ctypes.c_void_p
kernel32.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
kernel32.ReleaseMutex.argtypes = [ctypes.c_void_p]
kernel32.CloseHandle.argtypes = [ctypes.c_void_p]


class GameLink:
    def __init__(self, timeout: float = 10.0):
        if timeout <= 0:
            raise ValueError("GameLink timeout must be positive")
        deadline = time.monotonic() + timeout
        self.timeout = timeout
        self.mapping = None
        self.mutex = None
        attempts = 0
        last_mapping_open: tuple[bool, int | None] = (False, None)
        last_mutex_open: tuple[bool, int | None] = (False, None)
        while time.monotonic() < deadline:
            attempts += 1
            self.mapping = kernel32.OpenFileMappingW(FILE_MAP_ALL_ACCESS, False, MAPPING_NAME)
            mapping_error = None if self.mapping else ctypes.get_last_error()
            last_mapping_open = (bool(self.mapping), mapping_error)
            self.mutex = kernel32.OpenMutexW(SYNCHRONIZE | MUTEX_MODIFY_STATE, False, MUTEX_NAME)
            mutex_error = None if self.mutex else ctypes.get_last_error()
            last_mutex_open = (bool(self.mutex), mutex_error)
            if self.mapping and self.mutex:
                break
            if self.mapping:
                kernel32.CloseHandle(self.mapping)
                self.mapping = None
            if self.mutex:
                kernel32.CloseHandle(self.mutex)
                self.mutex = None
            time.sleep(0.05)
        if not self.mapping or not self.mutex:
            def describe_open(name: str, result: tuple[bool, int | None]) -> str:
                opened, error = result
                if opened:
                    return f"{name!r} opened on the last attempt"
                return f"{name!r} open failed with Win32 error {error} on the last attempt"

            raise RuntimeError(
                "DOSBox-X GameLink IPC unavailable after "
                f"{timeout:g}s/{attempts} attempts: "
                f"OpenFileMappingW {describe_open(MAPPING_NAME, last_mapping_open)}; "
                f"OpenMutexW {describe_open(MUTEX_NAME, last_mutex_open)}; "
                "frame sequence unavailable because no complete IPC connection was established"
            )
        self.view = kernel32.MapViewOfFile(self.mapping, FILE_MAP_ALL_ACCESS, 0, 0, 0)
        if not self.view:
            self.close()
            raise ctypes.WinError(ctypes.get_last_error())

    def close(self) -> None:
        if getattr(self, "view", None):
            kernel32.UnmapViewOfFile(self.view)
            self.view = None
        if self.mapping:
            kernel32.CloseHandle(self.mapping)
            self.mapping = None
        if self.mutex:
            kernel32.CloseHandle(self.mutex)
            self.mutex = None

    def __enter__(self) -> "GameLink":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def _lock(self) -> None:
        timeout_ms = max(1, min(round(self.timeout * 1000), 0xFFFFFFFE))
        result = kernel32.WaitForSingleObject(self.mutex, timeout_ms)
        if result in (WAIT_OBJECT_0, WAIT_ABANDONED_0):
            return
        if result == WAIT_TIMEOUT:
            raise TimeoutError(f"timed out after {self.timeout:g}s acquiring GameLink mutex")
        raise RuntimeError(f"failed to acquire GameLink mutex (wait result {result:#x})")

    def _unlock(self) -> None:
        if not kernel32.ReleaseMutex(self.mutex):
            raise ctypes.WinError(ctypes.get_last_error())

    def _read(self, offset: int, size: int) -> bytes:
        return ctypes.string_at(self.view + offset, size)

    def _write(self, offset: int, data: bytes) -> None:
        ctypes.memmove(self.view + offset, data, len(data))

    def status(self) -> dict[str, object]:
        self._lock()
        try:
            version, flags = struct.unpack("<BB", self._read(0, 2))
            program = self._read(66, 260).split(b"\0", 1)[0].decode("ascii", errors="replace")
            seq, width, height, image_fmt, _, par_x, par_y = struct.unpack(
                "<HHHBBHH", self._read(FRAME_OFFSET, FRAME_HEADER_SIZE)
            )
            ram_size = struct.unpack("<I", self._read(RAM_SIZE_OFFSET, 4))[0]
        finally:
            self._unlock()
        return {
            "version": version,
            "flags": flags,
            "program": program,
            "ram_size": ram_size,
            "frame": {"sequence": seq, "width": width, "height": height, "format": image_fmt, "par": [par_x, par_y]},
        }

    def _set_key(self, scan_code: int, pressed: bool) -> None:
        block, bit = divmod(scan_code, 32)
        if block >= 8:
            raise ValueError(f"scan code outside GameLink bitmap: {scan_code:#x}")
        self._lock()
        try:
            states = list(struct.unpack("<8I", self._read(INPUT_KEY_STATE_OFFSET, 32)))
            mask = 1 << bit
            states[block] = states[block] | mask if pressed else states[block] & ~mask
            self._write(INPUT_KEY_STATE_OFFSET, struct.pack("<8I", *states))
            self._write(INPUT_READY_OFFSET, b"\x01")
        finally:
            self._unlock()

    def _wait_consumed(self, timeout: float = 1.0) -> None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self._read(INPUT_READY_OFFSET, 1) == b"\x00":
                return
            time.sleep(0.005)
        raise TimeoutError("DOSBox-X did not consume GameLink input")

    def _set_mouse(self, dx: float, dy: float, buttons: int) -> None:
        if not 0 <= buttons <= 0xFF:
            raise ValueError(f"mouse button mask outside uint8: {buttons}")
        self._lock()
        try:
            self._write(INPUT_OFFSET, struct.pack("<ff", dx, dy))
            self._write(INPUT_MOUSE_BUTTON_OFFSET, bytes((buttons,)))
            self._write(INPUT_READY_OFFSET, b"\x01")
        finally:
            self._unlock()

    def move_mouse(self, dx: float, dy: float) -> None:
        self._set_mouse(dx, dy, 0)
        self._wait_consumed()

    def click(self, button: int = 0, hold: float = 0.15) -> None:
        if not 0 <= button <= 7:
            raise ValueError(f"mouse button outside GameLink mask: {button}")
        self._set_mouse(0.0, 0.0, 1 << button)
        self._wait_consumed()
        time.sleep(hold)
        self._set_mouse(0.0, 0.0, 0)
        self._wait_consumed()

    def press(self, key: str, hold: float = 0.15) -> None:
        names = [name.strip().lower() for name in key.split("+")]
        if not names or any(not name for name in names):
            raise ValueError(f"invalid key combination: {key}")
        scan_codes = [SCAN_CODES.get(name) for name in names]
        if any(scan_code is None for scan_code in scan_codes):
            raise ValueError(f"unsupported key: {key}; supported: {', '.join(sorted(SCAN_CODES))}")
        pressed: list[int] = []
        try:
            for scan_code in scan_codes:
                self._set_key(scan_code, True)
                pressed.append(scan_code)
                self._wait_consumed()
            time.sleep(hold)
        finally:
            # Never leave a GameLink scancode held if consumption times out.
            original_failure = sys.exc_info()[0] is not None
            release_failure: Exception | None = None
            for scan_code in reversed(pressed):
                try:
                    self._set_key(scan_code, False)
                    self._wait_consumed()
                except Exception as exc:  # release every key before surfacing an error
                    if release_failure is None:
                        release_failure = exc
            if release_failure is not None and not original_failure:
                raise release_failure

    def frame(self) -> tuple[dict[str, int], bytes]:
        self._lock()
        try:
            seq, width, height, image_fmt, _, par_x, par_y = struct.unpack(
                "<HHHBBHH", self._read(FRAME_OFFSET, FRAME_HEADER_SIZE)
            )
            if image_fmt != 1 or not width or not height:
                raise RuntimeError("GameLink has no RGBA frame")
            pixels = self._read(FRAME_BUFFER_OFFSET, width * height * 4)
        finally:
            self._unlock()
        return {"sequence": seq, "width": width, "height": height, "par_x": par_x, "par_y": par_y}, pixels

    def peek(self, address: int, length: int) -> bytes:
        if not 0 <= address <= 0xFFFFFFFF:
            raise ValueError(f"peek address outside uint32: {address}")
        if length < 1:
            raise ValueError("peek length must be positive")
        if address + length > 0x1_0000_0000:
            raise ValueError("peek range exceeds uint32 address space")
        self._lock()
        try:
            ram_size = struct.unpack("<I", self._read(RAM_SIZE_OFFSET, 4))[0]
            if address + length > ram_size:
                raise ValueError(f"peek range exceeds reported RAM size {ram_size:#x}")
            return self._read(RAM_DATA_OFFSET + address, length)
        finally:
            self._unlock()

    def poke(self, address: int, expected: bytes, replacement: bytes) -> bytes:
        if not expected:
            raise ValueError("poke expectation must not be empty")
        if len(expected) != len(replacement):
            raise ValueError("poke expectation and replacement lengths differ")
        if not 0 <= address <= 0xFFFFFFFF or address + len(expected) > 0x1_0000_0000:
            raise ValueError("poke range exceeds uint32 address space")
        self._lock()
        try:
            ram_size = struct.unpack("<I", self._read(RAM_SIZE_OFFSET, 4))[0]
            if address + len(expected) > ram_size:
                raise ValueError(f"poke range exceeds reported RAM size {ram_size:#x}")
            before = self._read(RAM_DATA_OFFSET + address, len(expected))
            if before != expected:
                raise RuntimeError(
                    f"poke expectation failed at {address:#x}: "
                    f"expected {expected.hex()}, found {before.hex()}"
                )
            self._write(RAM_DATA_OFFSET + address, replacement)
            after = self._read(RAM_DATA_OFFSET + address, len(replacement))
            if after != replacement:
                raise RuntimeError(
                    f"poke verification failed at {address:#x}: "
                    f"expected {replacement.hex()}, found {after.hex()}"
                )
            return before
        finally:
            self._unlock()

    def dump_memory(self, address: int, length: int) -> bytes:
        return self.peek(address, length)


def png_chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def write_png(path: Path, width: int, height: int, bgra: bytes) -> None:
    rows = bytearray()
    stride = width * 4
    for y in range(height):
        rows.append(0)
        row = bgra[y * stride : (y + 1) * stride]
        for x in range(0, len(row), 4):
            b, g, r, _a = row[x : x + 4]
            # GameLink currently leaves alpha zeroed. Screenshots are opaque so
            # external vision decoders do not treat them as fully transparent.
            rows.extend((r, g, b, 0xFF))
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", header) + png_chunk(b"IDAT", zlib.compress(rows)) + png_chunk(b"IEND", b""))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--timeout", type=float, default=10.0)
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("status")
    press_parser = subparsers.add_parser("press")
    press_parser.add_argument("keys", nargs="+")
    press_parser.add_argument("--pace", type=float, default=0.25)
    press_parser.add_argument("--hold", type=float, default=0.15)
    # A debugger-paused guest cannot consume normal `press` requests.  This deliberately
    # low-level command queues one edge without waiting, so a debugger trace can queue the
    # key, issue RUN, wait for the next breakpoint, then release it.  It is still GameLink
    # shared-memory input -- never host focus or SendKeys.
    queue_key_parser = subparsers.add_parser("queue-key")
    queue_key_parser.add_argument("key")
    queue_key_parser.add_argument("state", choices=("down", "up"))
    move_parser = subparsers.add_parser("move")
    move_parser.add_argument("dx", type=float)
    move_parser.add_argument("dy", type=float)
    click_parser = subparsers.add_parser("click")
    click_parser.add_argument("--button", type=int, choices=range(3), default=0)
    click_parser.add_argument("--hold", type=float, default=0.15)
    peek_parser = subparsers.add_parser("peek")
    peek_parser.add_argument("address", type=lambda value: int(value, 0))
    peek_parser.add_argument("length", type=lambda value: int(value, 0))
    poke_parser = subparsers.add_parser("poke")
    poke_parser.add_argument("address", type=lambda value: int(value, 0))
    poke_parser.add_argument("expected", type=bytes.fromhex)
    poke_parser.add_argument("replacement", type=bytes.fromhex)
    dump_parser = subparsers.add_parser("dump-memory")
    dump_parser.add_argument("output", type=Path)
    dump_parser.add_argument("--start", type=lambda value: int(value, 0), default=0)
    dump_parser.add_argument("--length", type=lambda value: int(value, 0))
    shot_parser = subparsers.add_parser("screenshot")
    shot_parser.add_argument("output", type=Path)
    args = parser.parse_args()

    with GameLink(args.timeout) as link:
        if args.command == "status":
            print(json.dumps(link.status(), indent=2))
        elif args.command == "press":
            for key in args.keys:
                link.press(key, args.hold)
                time.sleep(args.pace)
            print(json.dumps({"pressed": args.keys, "mechanism": "GameLink v4 shared memory"}))
        elif args.command == "queue-key":
            scan_code = SCAN_CODES.get(args.key.lower())
            if scan_code is None:
                raise ValueError(f"unsupported key: {args.key}; supported: {', '.join(sorted(SCAN_CODES))}")
            link._set_key(scan_code, args.state == "down")
            print(json.dumps({
                "key": args.key.lower(),
                "state": args.state,
                "mechanism": "GameLink v4 queued shared-memory key edge (no consumption wait)",
            }))
        elif args.command == "move":
            link.move_mouse(args.dx, args.dy)
            print(json.dumps({"mouse_delta": [args.dx, args.dy], "mechanism": "GameLink v4 shared memory"}))
        elif args.command == "click":
            link.click(args.button, args.hold)
            print(json.dumps({"mouse_button": args.button, "mechanism": "GameLink v4 shared memory"}))
        elif args.command == "peek":
            data = link.peek(args.address, args.length)
            print(json.dumps({"address": args.address, "length": len(data), "hex": data.hex()}))
        elif args.command == "poke":
            before = link.poke(args.address, args.expected, args.replacement)
            print(json.dumps({
                "address": args.address,
                "length": len(args.replacement),
                "before": before.hex(),
                "after": args.replacement.hex(),
                "mechanism": "GameLink v4 shared RAM compare-and-swap",
            }))
        elif args.command == "dump-memory":
            status = link.status()
            length = args.length if args.length is not None else status["ram_size"] - args.start
            data = link.dump_memory(args.start, length)
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_bytes(data)
            print(json.dumps({"output": str(args.output), "start": args.start, "length": len(data)}))
        elif args.command == "screenshot":
            metadata, pixels = link.frame()
            write_png(args.output, metadata["width"], metadata["height"], pixels)
            print(json.dumps({"output": str(args.output), **metadata}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
