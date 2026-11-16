"""Disk-only DOS file protocol fixture for compiled reward recovery tests.

This models file calls, not semantic admission. A new instance receives only
disk_snapshot(), never previous guest RAM, flags, handles or valid markers.
"""
from tools.test_secret_reward_transaction import TransactionMachine
from tools.test_secret_continuation_io import x86


class DiskCut(RuntimeError):
    """Successful durable file operation reached the requested crash cut."""


class RewardDiskMachine(TransactionMachine):
    def __init__(self, image, files, *, fault_at=None, fault="error",
                 error=5, cut_after=None, cut_after_call=None,
                 denied_paths=(), missing_parents=()):
        super().__init__(image, files)
        self.fault_at = fault_at  # one-based index of ALL file calls
        self.protocol_fault = fault
        self.protocol_error = error
        self.cut_after = cut_after  # one-based successful mutation count
        self.cut_after_call = cut_after_call  # one-based file call, after success
        self.denied_paths = {p.upper() for p in denied_paths}
        self.missing_parents = {p.upper().rstrip("\\") for p in missing_parents}
        self.mutations = 0
        self.writable_handles = set()
        self.directories = set()
        for path in self.files:
            parent = path.rsplit("\\", 1)[0]
            while parent:
                self.directories.add(parent)
                if "\\" not in parent:
                    break
                parent = parent.rsplit("\\", 1)[0]

    def disk_snapshot(self):
        return {path: bytes(body) for path, body in self.files.items()}

    def _path_error(self, path):
        if path in self.denied_paths:
            return 5
        if path.rsplit("\\", 1)[0] in self.missing_parents:
            return 3
        return 0

    def interrupt(self, uc, number, unused):
        ax = uc.reg_read(x86.UC_X86_REG_AX)
        ah = ax >> 8
        if number != 0x21 or ah not in (0x3c, 0x3d, 0x3e, 0x3f, 0x40, 0x41, 0x42, 0x43, 0x56, 0x5b):
            return super().interrupt(uc, number, unused)
        bx, cx, dx = (uc.reg_read(getattr(x86, "UC_X86_REG_" + r)) for r in ("BX", "CX", "DX"))
        address = (uc.reg_read(x86.UC_X86_REG_DS) << 4) + dx
        event = {"ax": ax, "bx": bx, "cx": cx, "dx": dx, "index": len(self.events) + 1}
        fault = self.protocol_fault if event["index"] == self.fault_at else None
        carry, mutation, result = False, False, 0
        path = None
        if ah in (0x3c, 0x3d, 0x41, 0x43, 0x56, 0x5b):
            path = self.path(address)
            event["path"] = path
        if ah == 0x56:
            target = self.path((uc.reg_read(x86.UC_X86_REG_ES) << 4) + uc.reg_read(x86.UC_X86_REG_DI))
            event.update(source=path, target=target)
        if fault == "error":
            result, carry = self.protocol_error, True
        elif path is not None and self._path_error(path):
            result, carry = self._path_error(path), True
        elif ah in (0x3e, 0x3f, 0x40, 0x42) and bx not in self.handles:
            result, carry = 6, True
        elif ah == 0x3d:
            assert ax == 0x3d00, "fixture supports read-only open"
            if path not in self.files:
                result, carry = 2, True
            else:
                result = self.open_other(path)
        elif ah == 0x43:
            assert ax == 0x4300, "fixture supports read-only attributes"
            if path.rstrip("\\") in self.directories:
                uc.reg_write(x86.UC_X86_REG_CX, 0x10)
            elif path in self.files:
                uc.reg_write(x86.UC_X86_REG_CX, 0x20)
            else:
                result, carry = 2, True
        elif ah == 0x5b:
            assert ax == 0x5b00
            if path in self.files:
                result, carry = 80, True
            else:
                self.files[path] = bytearray()
                result, mutation = self.open_other(path), True
                self.writable_handles.add(result)
        elif ah == 0x3c:
            # The API dispatches on AH; AL is not an input for DOS 3Ch.
            if path.rstrip("\\") in self.directories:
                result, carry = 5, True
            else:
                # DOS 3Ch creates a new file or truncates an existing one,
                # returning a read/write handle. Track ownership explicitly
                # so later AH=40 writes are allowed only on this handle.
                self.files[path] = bytearray()
                result, mutation = self.open_other(path), True
                self.writable_handles.add(result)
        elif ah == 0x3e:
            event["path"] = self.handles[bx][0]
            del self.handles[bx]
            self.writable_handles.discard(bx)
        elif ah == 0x42:
            name, cursor = self.handles[bx]
            event["path"] = name
            offset = (cx << 16) | dx
            if offset & 0x80000000:
                offset -= 0x100000000
            origin = ax & 255
            assert origin in (0, 1, 2)
            position = offset + (cursor if origin == 1 else len(self.files[name]) if origin == 2 else 0)
            if not 0 <= position <= 0x7fffffff:
                result, carry = 1, True
            else:
                self.handles[bx][1] = position
                returned = position ^ 1 if fault == "bad-position" else position
                result = returned & 65535
                uc.reg_write(x86.UC_X86_REG_DX, returned >> 16)
        elif ah == 0x3f:
            name, cursor = self.handles[bx]
            event["path"] = name
            body = bytes(self.files[name][cursor:cursor + cx])
            if fault == "short" and body:
                body = body[:-1]
            if body:
                uc.mem_write(address, body)
            self.handles[bx][1] += len(body)
            result = len(body)
        elif ah == 0x40:
            name, cursor = self.handles[bx]
            event["path"] = name
            if bx not in self.writable_handles:
                event.update(result=5, carry=True, mutation=False)
                self.events.append(event)
                uc.reg_write(x86.UC_X86_REG_AX, 5)
                uc.reg_write(x86.UC_X86_REG_EFLAGS, uc.reg_read(x86.UC_X86_REG_EFLAGS) | 1)
                return
            body = bytes(uc.mem_read(address, cx))
            if fault == "short" and body:
                body = body[:-1]
            if cx == 0:
                if cursor > len(self.files[name]):
                    self.files[name].extend(bytes(cursor - len(self.files[name])))
                else:
                    del self.files[name][cursor:]
            else:
                if cursor > len(self.files[name]):
                    self.files[name].extend(bytes(cursor - len(self.files[name])))
                self.files[name][cursor:cursor + len(body)] = body
            self.handles[bx][1] += len(body)
            result, mutation = len(body), True
        elif ah == 0x41:
            if path not in self.files:
                result, carry = 2, True
            elif any(h[0] == path for h in self.handles.values()):
                result, carry = 5, True
            else:
                del self.files[path]
                mutation = True
        elif ah == 0x56:
            failure = self._path_error(target)
            if failure:
                result, carry = failure, True
            elif path not in self.files:
                result, carry = 2, True
            elif target in self.files or any(h[0] in (path, target) for h in self.handles.values()):
                result, carry = 5, True
            else:
                self.files[target] = self.files.pop(path)
                mutation = True
        event.update(result=result, carry=carry, mutation=mutation)
        self.events.append(event)
        uc.reg_write(x86.UC_X86_REG_AX, result)
        flags = uc.reg_read(x86.UC_X86_REG_EFLAGS)
        uc.reg_write(x86.UC_X86_REG_EFLAGS, flags | 1 if carry else flags & ~1)
        if mutation:
            self.mutations += 1
            if self.mutations == self.cut_after:
                raise DiskCut(f"disk cut after {self.mutations} mutations: {event}")
        if not carry and event["index"] == self.cut_after_call:
            raise DiskCut(f"disk cut after successful file call: {event}")
