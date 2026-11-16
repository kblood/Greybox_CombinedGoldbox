"""Scoped original-game EGA bus bridge, backed by the unchanged ABI-1 C model.

The declared profile is DOSBox-compatible compare-enable, not physical IBM
hardware parity. Unicorn executes every guest instruction, including AND RMW.
Full memory hooks own one C operation; MMIO fragments only marshal its cache.
Rejected preflight accesses restore CPU and exact mixed ordinary-RAM bytes
after emulation unwinds. This is not general REP/instruction rollback.
"""
import ctypes as ct
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

from unicorn import UC_HOOK_CODE, UC_HOOK_INSN, UC_HOOK_MEM_READ, UC_HOOK_MEM_WRITE, UC_MEM_READ
from unicorn import x86_const as x86

BASE, LIMIT, BUS_END = 0xA0000, 0xB0000, 0xC0000
ROOT = Path(__file__).resolve().parents[1]
SOURCE_PINS = {
    "ega.c": "d223bb5ccd1895e407294c50811300f67c1f2046bcf637bade90bd410db35a43",
    "ega.h": "e15d5f325f1bc82f2c5419e08ceacab0a10edcd85b4ab142fe19148ac28283d5",
}
U8, U16, U32, PTR = ct.c_uint8, ct.c_uint16, ct.c_uint32, ct.c_void_p


def build_device(directory):
    """Fresh private build, never reads/writes a shared generated DLL."""
    directory = Path(directory).resolve()
    directory.mkdir(parents=True, exist_ok=False)
    source = ROOT / "rust/cok-recomp/csrc"
    before = {name: hashlib.sha256((source / name).read_bytes()).hexdigest() for name in SOURCE_PINS}
    if before != SOURCE_PINS:
        raise ValueError("Original EGA model source changed")
    env = os.environ.copy()
    if os.name == "nt":
        vs = Path("C:/Program Files/Microsoft Visual Studio/2022")
        candidates = list(vs.glob("*/VC/Auxiliary/Build/vcvars64.bat"))
        if not candidates:
            raise FileNotFoundError("Private EGA build requires an installed MSVC x64 compiler")
        setup = ROOT / "rust/cok-recomp/verification/opl/environment-prepare.cmd"
        result = subprocess.run([env["COMSPEC"], "/d", "/c", str(setup), str(candidates[0])],
                                capture_output=True, text=True, check=True)
        allowed = {"PATH", "INCLUDE", "LIB", "LIBPATH", "VCTOOLSINSTALLDIR", "WINDOWSSDKDIR",
                   "WINDOWSSDKVERSION", "VCTOOLSVERSION", "VSINSTALLDIR", "VCINSTALLDIR", "VSCMD_VER"}
        for line in result.stdout.splitlines():
            key, equal, value = line.partition("=")
            if equal and key.upper() in allowed:
                env[key.upper()] = value
        compiler = shutil.which("cl", path=env["PATH"])
        if not compiler:
            raise FileNotFoundError("MSVC setup did not provide cl")
        exports = sorted(set(re.findall(r"\b(ega_[a-z_]+)\s*\(", (source / "ega.h").read_text())))
        dll = directory / "ega.dll"
        command = [compiler, "/nologo", "/LD", "/W4", "/WX", str(source / "ega.c"),
                   "/I" + str(source), "/Fe:" + str(dll), "/Fo:" + str(directory / "ega.obj"),
                   "/link", *("/EXPORT:" + name for name in exports)]
    else:
        compiler = shutil.which("cc")
        if not compiler:
            raise FileNotFoundError("Private EGA build requires a C compiler")
        dll = directory / "ega.so"
        command = [compiler, "-shared", "-fPIC", "-Wall", "-Wextra", "-Werror",
                   str(source / "ega.c"), "-o", str(dll)]
    result = subprocess.run(command, cwd=directory, env=env, capture_output=True, text=True)
    (directory / "build.log").write_text(result.stdout + result.stderr)
    after = {name: hashlib.sha256((source / name).read_bytes()).hexdigest() for name in SOURCE_PINS}
    if before != after or result.returncode:
        raise AssertionError("Fresh private EGA build failed or changed its source")
    pin = hashlib.sha256(dll.read_bytes()).hexdigest()
    (directory / "manifest.json").write_text(json.dumps({"source": before, "dll": str(dll),
        "dllSha256": pin, "command": command, "exit": result.returncode}, indent=2) + "\n")
    return dll, pin


class EgaDevice:
    def __init__(self, path, sha256):
        if hashlib.sha256(Path(path).read_bytes()).hexdigest() != sha256:
            raise ValueError("Declared private EGA DLL hash differs")
        self.lib = ct.CDLL(str(Path(path).resolve()))
        signatures = {
            "create": [U32, ct.POINTER(PTR)], "preflight_read": [PTR, U32, U32],
            "preflight_write": [PTR, U32, U32], "commit_read": [PTR, U32, U32, ct.POINTER(U16)],
            "commit_write": [PTR, U32, U32, U16], "preflight_out": [PTR, U32, U32, U16],
            "commit_out": [PTR, U32, U32, U16], "preflight_in": [PTR, U32, U32],
            "commit_in": [PTR, U32, U32, ct.POINTER(U16)],
            "peek_plane": [PTR, U32, U32, ct.POINTER(U8)],
            "peek_latch": [PTR, U32, ct.POINTER(U8)],
            "peek_register": [PTR, U32, U32, ct.POINTER(U8)],
            "peek_index": [PTR, U32, ct.POINTER(U8)],
        }
        for name, args in signatures.items():
            fn = getattr(self.lib, "ega_" + name)
            fn.argtypes, fn.restype = args, ct.c_int32
            setattr(self.lib, name, fn)
        self.lib.ega_destroy.argtypes, self.lib.ega_destroy.restype = [PTR], None
        self.pointer = PTR()
        if self.lib.create(1, ct.byref(self.pointer)):
            raise AssertionError("EGA profile1 creation failed")

    def close(self):
        if self.pointer:
            self.lib.ega_destroy(self.pointer)
            self.pointer = PTR()

    def peek(self, name, *args):
        output = U8(0xE7)
        if getattr(self.lib, "peek_" + name)(self.pointer, *args, ct.byref(output)):
            raise AssertionError("EGA diagnostic outside declared device")
        return output.value

    def registers(self):
        return tuple(self.peek("register", bank, index) for bank, count in ((0, 5), (1, 9))
                     for index in range(count))


class DeviceRejected(AssertionError):
    pass


class EgaBridge:
    def __init__(self, uc, device, *, replace_ram=True, guards=()):
        self.uc, self.device, self.guards = uc, device, tuple(guards)
        self.cache = None
        self.pending_error = None
        self.events = []
        self.ordinary_preimages = {}
        self.context = None
        self.instruction_commits = 0
        self.rollback_verified = False
        self._start = uc.emu_start
        if replace_ram:
            uc.mem_unmap(BASE, BUS_END - BASE)
        # Upper guard aperture is MMIO too, never a permissive RAM shadow.
        uc.mmio_map(BASE, BUS_END - BASE, self._read, None, self._write, None)
        self.hooks = [
            uc.hook_add(UC_HOOK_CODE, self._instruction),
            uc.hook_add(UC_HOOK_MEM_READ | UC_HOOK_MEM_WRITE, self._access,
                        begin=BASE - 16, end=BUS_END + 16),
            uc.hook_add(UC_HOOK_INSN, self._in, None, 1, 0, x86.UC_X86_INS_IN),
            uc.hook_add(UC_HOOK_INSN, self._out, None, 1, 0, x86.UC_X86_INS_OUT),
        ]

    def _fail(self, message):
        if self.pending_error is None:
            self.pending_error = DeviceRejected(message)
        self.uc.emu_stop()

    def _finish(self):
        if self.cache and self.cache["covered"] != set(range(self.cache["address"],
                                                            self.cache["address"] + self.cache["size"])):
            raise DeviceRejected("Incomplete original-access MMIO fragment coverage")
        self.cache = None

    def _instruction(self, uc, address, size, unused):
        if self.pending_error:
            uc.emu_stop()
            return
        try:
            self._finish()
            self.context = uc.context_save()
            self.ordinary_preimages = {}
            self.instruction_commits = 0
        except Exception as error:
            self._fail(str(error))

    def _access(self, uc, kind, address, size, value, unused):
        if self.pending_error or address >= BUS_END or address + size <= BASE:
            return
        direction = "read" if kind == UC_MEM_READ else "write"
        # Preserve first ordinary-RAM preimages BEFORE guards/preflight. These
        # bytes can still be written by Unicorn after emu_stop at a mixed edge.
        # A rejected READ can be the first half of an RMW instruction. The
        # deferred WRITE may run despite sticky error, so journal on both.
        for byte in range(address, address + size):
            if not BASE <= byte < BUS_END and byte not in self.ordinary_preimages:
                self.ordinary_preimages[byte] = bytes(uc.mem_read(byte, 1))
        try:
            self._finish()
            for guard in self.guards:
                guard(direction, address, size, value)
            status = getattr(self.device.lib, "preflight_" + direction)(
                self.device.pointer, address, size * 8)
            if status:
                raise DeviceRejected(f"EGA {direction} preflight status{status} at {address:x}/{size}")
            if direction == "read":
                output = U16(0xBEEF)
                status = self.device.lib.commit_read(self.device.pointer, address, size * 8, ct.byref(output))
                value = output.value
            else:
                status = self.device.lib.commit_write(self.device.pointer, address, size * 8, value)
            if status:
                raise DeviceRejected("EGA commit rejected after successful preflight")
            self.instruction_commits += 1
            self.cache = {"direction": direction, "address": address, "size": size,
                          "value": value, "covered": set()}
            self.events.append({"kind": direction, "address": address, "size": size, "value": value,
                                "latches": [self.device.peek("latch", p) for p in range(4)]})
        except Exception as error:
            self._fail(str(error))

    def _fragment(self, relative, size, value=None):
        direction = "read" if value is None else "write"
        self.events.append({"kind": "fragment-" + direction, "offset": relative,
                            "size": size, "suppressed": self.pending_error is not None})
        if self.pending_error:
            return 0
        try:
            cache = self.cache
            if not cache or cache["direction"] != direction:
                raise DeviceRejected("MMIO fragment has no corresponding original access")
            result = 0
            intersection = []
            for i in range(size):
                address = BASE + relative + i
                if cache["address"] <= address < cache["address"] + cache["size"]:
                    if address in cache["covered"]:
                        raise DeviceRejected("Duplicate original-access MMIO fragment")
                    byte = cache["value"] >> (8 * (address - cache["address"])) & 255
                    if direction == "write" and (value >> (8 * i)) & 255 != byte:
                        raise DeviceRejected("MMIO write fragment differs from original operand")
                    result |= byte << (8 * i)
                    intersection.append(address)
            if not intersection:
                raise DeviceRejected("MMIO fragment does not intersect original operand")
            cache["covered"].update(intersection)
            return result
        except Exception as error:
            self._fail(str(error))
            return 0  # integer even for deferred read errors

    def _read(self, uc, relative, size, unused):
        return self._fragment(relative, size)

    def _write(self, uc, relative, size, value, unused):
        self._fragment(relative, size, value)

    def _port(self, direction, port, size, value=None):
        if self.pending_error:
            return 0
        try:
            self._finish()
            args = (self.device.pointer, port, size * 8)
            if direction == "out":
                args += (value,)
            status = getattr(self.device.lib, "preflight_" + direction)(*args)
            if status:
                raise DeviceRejected(f"EGA {direction} preflight status{status} at port{port:x}/{size}")
            output = U16(0xBEEF)
            if direction == "in":
                args += (ct.byref(output),)
            if getattr(self.device.lib, "commit_" + direction)(*args):
                raise DeviceRejected("EGA port commit failed after preflight")
            self.instruction_commits += 1
            result = value if direction == "out" else output.value
            self.events.append({"kind": direction, "port": port, "size": size, "value": result,
                                "registers": self.device.registers()})
            return result
        except Exception as error:
            self._fail(str(error))
            return 0

    def _in(self, uc, port, size, unused):
        return self._port("in", port, size)

    def _out(self, uc, port, size, value, unused):
        self._port("out", port, size, value)

    def emu_start(self, *args, **kwargs):
        if self.pending_error:
            raise self.pending_error
        caught = None
        try:
            self._start(*args, **kwargs)
            if not self.pending_error:
                self._finish()
        except Exception as error:
            caught = error
        if self.pending_error or caught:
            # CPU rollback is declared only for precommit rejects. A protocol
            # fault after a C commit is a hard failure, not transactional parity.
            if not self.instruction_commits and self.context is not None:
                for address, value in self.ordinary_preimages.items():
                    self.uc.mem_write(address, value)
                self.uc.context_restore(self.context)
                self.rollback_verified = all(bytes(self.uc.mem_read(a, 1)) == v
                                             for a, v in self.ordinary_preimages.items())
            raise self.pending_error or caught
