"""Execute coordinator restoration/tool-copy helpers, including faulted closes."""
from pathlib import Path
import shutil
import struct
import subprocess

import pytest
from tools.test_secret_continuation_io import Machine, BASE, x86

ROOT = Path(__file__).resolve().parents[1]
EXPORTS = ('kn_copy_file', 'kn_restore_section', 'kf_teardown', 'kc_open', 'kc_close',
           'kc_fh', 'kc_extent', 'kc_verified', 'kc_mode', 'source', 'target',
           'kn_restore_authorized', 'kr_header', 'kr_offsets', 'kv_paths',
           'kf_out', 'kf_other', 'kf_live')


class FileMachine(Machine):
    def interrupt(self, uc, number, unused):
        ax=uc.reg_read(x86.UC_X86_REG_AX)
        if ax >> 8 not in (0x3c,0x41): return super().interrupt(uc,number,unused)
        name=self.path((uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_DX))
        carry=False
        self.events.append({'ax':ax,'path':name})
        if ax >> 8 == 0x3c:
            if self.fault == 'create': ax,carry=5,True
            else:
                self.files[name]=bytearray()
                ax=self.open_other(name)
        elif name not in self.files: ax,carry=2,True
        else: del self.files[name]
        uc.reg_write(x86.UC_X86_REG_AX,ax)
        flags=uc.reg_read(x86.UC_X86_REG_EFLAGS)
        uc.reg_write(x86.UC_X86_REG_EFLAGS,flags|1 if carry else flags&~1)


@pytest.fixture(scope='module')
def image(tmp_path_factory):
    nasm = shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    if not Path(nasm).is_file() and not shutil.which(nasm): pytest.skip('NASM absent')
    src = ROOT/'native/src'
    main = (src/'ccnext.asm').read_text()
    equal = main[main.index('kn_path_equal:'):main.index('; DX=absolute child helper')]
    folder = tmp_path_factory.mktemp('continuation-files')
    asm, binary = folder/'probe.asm', folder/'probe.bin'
    asm.write_text('cpu 386\nbits 16\norg 100h\ndw '+','.join(EXPORTS)+'\n'+equal+'''
%include "secretcontinuation_io.inc"
%include "secretcontinuation_files.inc"
kn_restore_authorized dw 0
kr_header times 64 db 0
kr_offsets times 10 dd 0
kv_paths times 1120 db 0
source times 112 db 0
target times 112 db 0
''',encoding='ascii')
    proc = subprocess.run([nasm,'-I',str(src)+'/', '-f','bin',str(asm),'-o',str(binary)],
                          capture_output=True,text=True,timeout=30)
    assert proc.returncode == 0, proc.stdout+proc.stderr
    data = binary.read_bytes()
    return data, dict(zip(EXPORTS,struct.unpack_from('<'+'H'*len(EXPORTS),data)))


def prepare(image, extra=None):
    body = bytes((i*31)&255 for i in range(140000))
    files = {'C:\\K.GSK': b'prefix'+body+b'end'}
    files.update(extra or {})
    m = FileMachine(image,files)
    assert not m.open('C:\\K.GSK')
    paths = ('D:\\ECL.GLB','C:\\PARTY.GBP','C:\\HOST.BIN','C:\\RESULT.BIN',
             'C:\\INPUT.EFX','C:\\SEED.BIN','C:\\BATTLE.OUT','C:\\NEXT.EFX','C:\\K.GSK','C:\\WORK')
    m.put('kv_paths',b''.join(p.encode()+bytes(112-len(p)) for p in paths))
    m.put('kr_offsets', bytes(16)+struct.pack('<I',6)+bytes(20))
    m.put('kr_header',bytes(40)+struct.pack('<I',len(body))+bytes(20))
    m.put('kn_restore_authorized',b'\1\0')
    return m,body


@pytest.mark.parametrize('existing', [False, True])
def test_owned_source_alias_restores_only_the_exact_gbid_payload(image, existing):
    target = 'C:\\WORK\\SRC.GLB'
    m, body = prepare(image, {target: b'old source'} if existing else {})
    m.put('target', target.encode()+b'\0')
    assert not m.call('kn_restore_section', SI=m.labels['target'], EAX=22, EDX=len(body)-16)
    assert bytes(m.files[target]) == body[16:]
    assert bytes(m.files['C:\\K.GSK']) == b'prefix'+body+b'end'
    assert 'C:\\WORK\\SRC.GNG' not in m.files and 'C:\\WORK\\SRC.GOG' not in m.files


@pytest.mark.parametrize('target,delta,length_delta', [
    ('D:\\ECL.GLB', 0, 0), ('C:\\WORK\\SRC.GLB', 1, 0),
    ('C:\\WORK\\SRC.GLB', 0, 1), ('C:\\WORK\\OTHER.GLB', 0, 0),
])
def test_source_subspan_cannot_restore_to_live_source_or_wrong_owned_range(image, target, delta, length_delta):
    m, body = prepare(image, {target: b'preserve me'})
    m.put('target', target.encode()+b'\0')
    before = {k:bytes(v) for k,v in m.files.items()}
    assert m.call('kn_restore_section', SI=m.labels['target'], EAX=22+delta,
                  EDX=len(body)-16+length_delta)
    assert {k:bytes(v) for k,v in m.files.items()} == before


@pytest.mark.parametrize('target', ['C:\\INPUT.IDN','C:\\NEXT.IDN','C:\\WORK\\INPUT.IDN'])
@pytest.mark.parametrize('existing', [False,True])
def test_closed_identity_restore_preserves_snapshot_and_old_target_until_ready(image,target,existing):
    m,body = prepare(image,{target:b'old'} if existing else {})
    owned = m.get('kc_fh',2)
    m.put('target',target.encode()+b'\0')
    assert not m.call('kn_restore_section',SI=m.labels['target'],EAX=6,EDX=len(body))
    assert m.files[target] == body and m.files['C:\\K.GSK'] == b'prefix'+body+b'end'
    assert m.get('kc_fh',2) == owned
    assert len(m.handles) == 1


@pytest.mark.parametrize('target',['D:\\ECL.GLB','C:\\PARTY.GBP','C:\\HOST.BIN','C:\\RESULT.BIN','C:\\K.GSK'])
def test_restore_cannot_write_protected_inputs(image,target):
    m,body = prepare(image,{target:b'protected'} if target != 'C:\\K.GSK' else {})
    before = {n:bytes(b) for n,b in m.files.items()}
    m.put('target',target.encode()+b'\0')
    assert m.call('kn_restore_section',SI=m.labels['target'],EAX=6,EDX=len(body))
    assert m.files == {n:bytearray(b) for n,b in before.items()}
    assert not any(e['ax'] >> 8 in (0x3c,0x40,0x41,0x56) for e in m.events)


@pytest.mark.parametrize('fault',['read','short-read','write','short-write','close','rename'])
def test_failed_restore_keeps_authority_and_old_live_file(image,fault):
    m,body = prepare(image,{'C:\\INPUT.IDN':b'old'})
    m.put('target',b'C:\\INPUT.IDN\0'); m.fault=fault
    assert m.call('kn_restore_section',SI=m.labels['target'],EAX=6,EDX=len(body))
    assert m.files['C:\\INPUT.IDN'] == b'old'
    assert m.files['C:\\K.GSK'] == b'prefix'+body+b'end'
    m.fault=None
    m.call('kf_teardown')
    assert len(m.handles) == 1


@pytest.mark.parametrize('existing',[False,True])
def test_tool_copy_requires_absence_and_preserves_current_snapshot(image,existing):
    extra={'C:\\TOOL.COM':b'code'}
    if existing: extra['C:\\WORK\\TOOL.COM']=b'foreign'
    m,_=prepare(image,extra); owned=m.get('kc_fh',2)
    m.put('source',b'C:\\TOOL.COM\0'); m.put('target',b'C:\\WORK\\TOOL.COM\0')
    assert m.call('kn_copy_file',DX=m.labels['source'],DI=m.labels['target']) == existing
    assert m.files['C:\\WORK\\TOOL.COM'] == (b'foreign' if existing else b'code')
    assert m.get('kc_fh',2) == owned and len(m.handles) == 1
