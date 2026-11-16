"""Source-owned ordinary fixed-gift world prerequisites, original code only.

All allocator/resource/parser/render/selection/XP/collection routines execute
unchanged. BASIC BLOCK startup probes have explicit stop boundaries; they are
not whole-startup return claims. The supported BIOS future-input schedules are
closed no-Take diagnostics: Enter/E/N and Enter/T/Down/E/E/N. Their task-local
instruction/time budgets are separately measured. Production engine untouched.

Pose3/3/4 is a declared observed-original RAM61 input, not executed ECL/native
initialization. Only original-linked actor data is loaded; no GSK/OWNER restore.
"""
import hashlib
import struct

from unicorn import UC_HOOK_CODE
from unicorn import x86_const as x86

from tools.secret_melee_oracle import STACK_BASE, RETURN, DEFAULT_ROOT, dax_members, Machine
from tools.secret_treasure_menu_oracle import public_target
from tools.secret_treasure_device_oracle import TreasureDeviceMachine
from tools.secret_treasure_oracle import COMBAT, ACTOR_BASE, PLAYER_DATA

class TreasureWorldMachine(TreasureDeviceMachine):

    def call(self, file_offset, args, *, stop=None, seed=1, parity=1, data_base=PLAYER_DATA):
        if file_offset != COMBAT:
            return super().call(file_offset, args, stop=stop, seed=seed, parity=parity, data_base=data_base)
        assert args == () and stop is None and (data_base == PLAYER_DATA) and (self.keys in ((0x1c0d, 0x1245, 0x314e), (0x1c0d, 0x1454, 0x5000, 0x1245, 0x1245, 0x314e)))
        assert bytes(self.uc.mem_read(PLAYER_DATA + 26646, 1)) == b'\x01'
        assert not self.uc.mem_read(PLAYER_DATA + 42189, 1)[0] and (not self.uc.mem_read(PLAYER_DATA + 42170, 1)[0])
        assert struct.unpack('<7I', self.uc.mem_read(PLAYER_DATA + 34732, 28)) == (0, 0, 0, 0, 0, 20, 0)
        assert len(self.nodes(bytes(self.uc.mem_read(PLAYER_DATA + 34760, 4)), 67, 42)) == 12
        assert bytes(self.uc.mem_read(ACTOR_BASE, 6 * 439)) == self.source_party_snapshot
        _, bank = self.bitmap(32250, 3255)
        assert hashlib.sha256(bank[23:]).hexdigest() == '58ae69f9b0a1bfae7fa511c2a9f3d35c2587e03aa6a42bc321ed1439856b1488'
        segment = next((self.segments[d['index']] for d in self.retail.descriptors if d['ovr_file_offset'] <= file_offset < d['ovr_file_offset'] + d['code_size']))
        for name, value in [('CS', segment), ('DS', data_base >> 4), ('ES', data_base >> 4), ('SS', STACK_BASE >> 4), ('SP', 61440), ('BP', 0), ('AX', 0), ('DX', 0), ('EFLAGS', 2)]:
            self.uc.reg_write(getattr(x86, 'UC_X86_REG_' + name), value)
        self.uc.mem_write(STACK_BASE + 61440, struct.pack('<HH', 0, RETURN >> 4))
        self.uc.mem_write(data_base + 22940, struct.pack('<I', seed))
        self.uc.mem_write(data_base + 36295, bytes([parity]))
        self.uc.emu_start(self.location(file_offset), RETURN, count=(2000000 if len(self.keys) == 3 else 3000000), timeout=(40000000 if len(self.keys) == 3 else 45000000))
        final = (self.reg('CS') << 4) + self.reg('IP')
        if final != RETURN or self.unmapped:
            raise AssertionError(f'Scoped original empty reward did not fully return: {final:x}')
        return self.reg('AX') & 255

    def __init__(self, *, heap_psp_end=0x5000, **kwargs):
        self.bios_trace = []
        self.pic_events = []
        self.mask_calls = []
        self.map_reads = []
        self.picture_scope = None
        super().__init__(heap_psp_end=heap_psp_end, **kwargs)
        banks = bytes(self.uc.mem_read(PLAYER_DATA + 32234, 24))
        code = tuple((bytes(self.uc.mem_read(lo, hi - lo)) for lo, hi in self.code_ranges))
        assert bytes(self.uc.mem_read(PLAYER_DATA + 26652, 4)) == bytes(4)
        self.call_resident(17931, 700, (26652, PLAYER_DATA >> 4, 0, 1, 3, 24))
        descriptor = next((d for d in self.retail.descriptors if d['ovr_file_offset'] <= 66680 < d['ovr_file_offset'] + d['code_size']))
        for name, value in [('CS', self.segments[descriptor['index']]), ('DS', PLAYER_DATA >> 4), ('SS', STACK_BASE >> 4), ('SP', 61408), ('BP', 61376), ('EFLAGS', 2)]:
            self.uc.reg_write(getattr(x86, 'UC_X86_REG_' + name), value)
        self.uc.emu_start(self.location(66680), self.location(67045), count=500000, timeout=5000000)
        assert (self.reg('CS') << 4) + self.reg('IP') == self.location(67045) and (not self.unmapped)
        assert (self.reg('SP'), self.reg('BP')) == (61408, 61376)
        assert bytes(self.uc.mem_read(PLAYER_DATA + 26672, 168)) == bytes(168)
        assert bytes(self.uc.mem_read(PLAYER_DATA + 26840, 336)) == bytes(336)
        assert bytes(self.uc.mem_read(PLAYER_DATA + 27176, 336)) == bytes([255]) * 336
        assert bytes(self.uc.mem_read(PLAYER_DATA + 27512, 336)) == bytes(336)
        assert bytes(self.uc.mem_read(PLAYER_DATA + 32234, 24)) == banks
        assert tuple((bytes(self.uc.mem_read(lo, hi - lo)) for lo, hi in self.code_ranges)) == code
        _, aux = self.bitmap(26652, 311)
        assert struct.unpack_from('<HH', aux) == (24, 3) and struct.unpack_from('<H', aux, 17)[0] == 288
        assert aux[23:] == bytes(288)
        self.ui_init = {'entry': '10478', 'stopBefore': '105E5', 'auxiliaryBytes': 311, 'dirtyStartsFFFF': True, 'banksAndCodeInvariant': True, 'sp': self.reg('SP'), 'bp': self.reg('BP')}
        pic = (DEFAULT_ROOT / 'PIC4.DAX').read_bytes()
        assert hashlib.sha256(pic).hexdigest() == '4d1ed9171600cd889116fcba23070ae0e3a3320d5780a0e2495c7951ff43e362'
        member = dax_members(pic)[60]
        assert hashlib.sha256(member).hexdigest() == 'c59d2d99401b507af52aa7b1681ca139351990229809826aeb9f21b6be78a250'
        assert len(member) == 3894 and member[:22].hex() == '010000000058000b0000000000010011022121111233'
        self.files['PIC4.DAX'] = pic
        sky = (DEFAULT_ROOT / 'SKY.DAX').read_bytes()
        assert len(sky) == 2448 and hashlib.sha256(sky).hexdigest() == '1ffe6b50f6d76116a9d72fbb05a94ea70160c8fad2a49b9c4b08776b16fbadf9'
        assert hashlib.sha256(dax_members(sky)[252]).hexdigest() == 'eb906cd52a36b49dd45a82f2e1ba9c14ba16df2f73d94104300f44ca5a99c371'
        self.files['SKY.DAX'] = sky
        geo = (DEFAULT_ROOT / 'GEO1.DAX').read_bytes()
        assert len(geo) == 3890 and hashlib.sha256(geo).hexdigest() == '27efe6936da5d4a119d4b5e1cd78267360822755b0c5d417fc882a9054ae7416'
        assert hashlib.sha256(dax_members(geo)[16]).hexdigest() == 'c87eac79939d94edbec51358e6f278fa855831fa0e86ff303eea33e2565c2240'
        self.files['GEO1.DAX'] = geo
        raw203 = dax_members(self.files['8X8D1.DAX'])[203]
        assert hashlib.sha256(raw203).hexdigest() == 'e9f41ebcbafe3bb37d6f5a92193430910c13999a6d81fcfe625decc6c0bad553'
        Machine.call(self, 277752, (0, 203), data_base=PLAYER_DATA)
        descriptor = next((d for d in self.retail.descriptors if d['ovr_file_offset'] <= 67933 < d['ovr_file_offset'] + d['code_size']))
        for name, value in [('CS', self.segments[descriptor['index']]), ('DS', PLAYER_DATA >> 4), ('SS', STACK_BASE >> 4), ('SP', 60160), ('BP', 61184), ('EFLAGS', 2)]:
            self.uc.reg_write(getattr(x86, 'UC_X86_REG_' + name), value)
        self.uc.emu_start(self.location(67933), self.location(67968), count=1000000, timeout=15000000)
        assert (self.reg('CS') << 4) + self.reg('IP') == self.location(67968) and self.reg('SP') == 60160
        assert bytes(self.uc.mem_read(PLAYER_DATA + 35278, 4)) == bytes(4)
        for name, value in [('CS', self.segments[descriptor['index']]), ('DS', PLAYER_DATA >> 4), ('SS', STACK_BASE >> 4), ('SP', 61408), ('BP', 61376), ('EFLAGS', 2)]:
            self.uc.reg_write(getattr(x86, 'UC_X86_REG_' + name), value)
        self.uc.emu_start(self.location(66536), self.location(66552), count=500000, timeout=5000000)
        assert (self.reg('CS') << 4) + self.reg('IP') == self.location(66552) and self.reg('SP') == 61408
        self.call(264813, (16,), data_base=PLAYER_DATA)
        o, seg = struct.unpack('<HH', self.uc.mem_read(PLAYER_DATA + 35278, 4))
        assert bytes(self.uc.mem_read(seg * 16 + o, 1024)) == dax_members(geo)[16][2:]
        self.uc.mem_write(PLAYER_DATA + 35287, bytes([3, 3, 4]))
        self.uc.mem_write(PLAYER_DATA + 42178, b'\x00')
        self.declared_pose = {'source': 'observedoriginalRAM61 only, notexecutedECL/nativeposeclaim', 'x': 3, 'y': 3, 'direction': 4}
        d, proc = public_target(self.retail, 376 * 16 + 52)
        self.picture_entry = (self.segments[d] << 4) + proc
        self.uc.hook_add(UC_HOOK_CODE, self.picture_boundary)
        self.uc.hook_add(UC_HOOK_CODE, self.mask_boundary)

    def mask_boundary(self, uc, pc, size, unused):
        if pc == self.location(261885):
            self.map_reads.append({'entry': '3FEFD', 'map89CE': bytes(uc.mem_read(PLAYER_DATA + 35278, 4)).hex(), 'scope': 'diagnostic context only; NULL map does not prove ordinary map ownership'})
        if pc in (79031, 79267, 85566, 85723):
            sp = (self.reg('SS') << 4) + self.reg('SP')
            near = pc in (85566, 85723)
            args = struct.unpack('<10H', uc.mem_read(sp + (2 if near else 4), 20))
            event = {'pc': hex(pc), 'ds': self.reg('DS'), 'sp': self.reg('SP'), 'stack64': bytes(uc.mem_read(sp, 64)).hex(), 'args': args, 'slots': {hex(off): bytes(uc.mem_read(PLAYER_DATA + off, 4)).hex() for off in (26648, 26652, 32234, 32238, 32242, 32246, 32250, 32254, 32258, 32262, 32266, 35278, 35304, 35308, 35312)}}
            if near:
                src = args[3] * 16 + args[2]
                dst = args[1] * 16 + args[0]
                event.update(sourceAddress=hex(src), destinationAddress=hex(dst), sourceHeader23=bytes(uc.mem_read(src, 23)).hex(), destinationHeader23=bytes(uc.mem_read(dst, 23)).hex())
            self.mask_calls.append(event)
            if near and src == 0:
                raise AssertionError('Declared bitmap source missing; stop beforeoriginalnilheadercompositor')

    def picture_boundary(self, uc, pc, size, unused):
        if pc == self.picture_entry:
            sp = (self.reg('SS') << 4) + self.reg('SP')
            args = struct.unpack('<6H', uc.mem_read(sp + 4, 12))
            assert args[:4] == (35316, PLAYER_DATA >> 4, 0, 60)
            assert bytes(uc.mem_read((args[5] << 4) + args[4], 4)) == b'\x03PIC' and uc.mem_read(PLAYER_DATA + 26599, 1)[0] == 6
            ip, cs = struct.unpack('<HH', uc.mem_read(sp, 4))
            self.picture_scope = {'return': (cs << 4) + ip, 'actors': bytes(uc.mem_read(ACTOR_BASE, 6 * 439)), 'pools': bytes(uc.mem_read(PLAYER_DATA + 34732, 28)), 'items': self.nodes(bytes(uc.mem_read(PLAYER_DATA + 34760, 4)), 67, 42), 'seed': bytes(uc.mem_read(PLAYER_DATA + 22940, 4)), 'code': tuple((bytes(uc.mem_read(lo, hi - lo)) for lo, hi in self.code_ranges)), 'a': len(self.allocations), 'f': len(self.frees)}
            self.pic_events.append({'entry': hex(pc), 'args': args})
        elif self.picture_scope and pc == self.picture_scope['return']:
            b = self.picture_scope
            assert bytes(uc.mem_read(ACTOR_BASE, 6 * 439)) == b['actors'] and bytes(uc.mem_read(PLAYER_DATA + 34732, 28)) == b['pools']
            assert self.nodes(bytes(uc.mem_read(PLAYER_DATA + 34760, 4)), 67, 42) == b['items'] and bytes(uc.mem_read(PLAYER_DATA + 22940, 4)) == b['seed']
            assert tuple((bytes(uc.mem_read(lo, hi - lo)) for lo, hi in self.code_ranges)) == b['code']
            self.pic_events.append({'returned': True, 'output64': bytes(uc.mem_read(PLAYER_DATA + 35316, 64)).hex(), 'allocations': self.allocations[b['a']:], 'frees': self.frees[b['f']:], 'handles': len(self.handles), 'actorItemPoolSeedCodeInvariant': True})
            self.picture_scope = None

    def interrupt(self, uc, number, unused):
        if number == 33 and self.reg('AX') >> 8 in (78, 61):
            address = (self.reg('DS') << 4) + self.reg('DX')
            raw = bytes(uc.mem_read(address, 128))
            assert b'\x00' in raw
            name = raw.split(b'\x00', 1)[0].decode('ascii')
            if name.upper() in ('SKY.DAX', 'GEO1.DAX'):
                data = self.files[name.upper()]
                self.events.append({'interrupt': number, 'ax': self.reg('AX'), 'path': name, 'cwd': 'C:\\IMPORT', 'size': len(data)})
                if self.reg('AX') >> 8 == 78:
                    assert self.dta
                    dta = bytearray(43)
                    struct.pack_into('<I', dta, 26, len(data))
                    basename = name.upper().encode() + b'\x00'
                    dta[30:30 + len(basename)] = basename
                    uc.mem_write(self.dta, bytes(dta))
                else:
                    handle = self.next_handle
                    self.next_handle += 1
                    self.handles[handle] = [data, 0, name]
                    self.word('AX', handle)
                self.carry(False)
                return
            if name.upper() == 'PIC4.DAX':
                assert self.picture_scope is not None
                data = self.files['PIC4.DAX']
                self.events.append({'interrupt': number, 'ax': self.reg('AX'), 'path': name, 'cwd': 'C:\\IMPORT', 'size': len(data)})
                if self.reg('AX') >> 8 == 78:
                    assert self.dta
                    dta = bytearray(43)
                    struct.pack_into('<I', dta, 26, len(data))
                    dta[30:39] = b'PIC4.DAX\x00'
                    uc.mem_write(self.dta, bytes(dta))
                else:
                    handle = self.next_handle
                    self.next_handle += 1
                    self.handles[handle] = [data, 0, name]
                    self.word('AX', handle)
                self.carry(False)
                return
        if number == 22:
            self.bios_trace.append({'pc': hex((self.reg('CS') << 4) + self.reg('IP')), 'ax': self.reg('AX'), 'index': getattr(self, 'input_index', -2), 'alreadyRead': getattr(self, 'key_read', False)})
        return super().interrupt(uc, number, unused)

    def execute(self, entry, instruction, **kwargs):
        if entry == COMBAT:
            self.source_party_snapshot = bytes(self.uc.mem_read(ACTOR_BASE, 6 * 439))
        return super().execute(entry, instruction, **kwargs)

