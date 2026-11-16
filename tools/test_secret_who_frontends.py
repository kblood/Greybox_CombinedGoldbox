"""Actual compiled WHO frontends versus original keyboard identity semantics.

Pending v16 envelopes use the established source schema. Original WHO executes
all original parser/render/selector instructions; frontend DOS/UI IO is modeled.
"""
from pathlib import Path
import ntpath
import shutil
import struct
import subprocess

import pytest
from tools.test_ccfp_menu_automation import Machine as BaseMachine
from tools.test_secret_continuation import menu_effect, fixed_stream
from tools.test_secret_who import retail, bodies
from tools.secret_who_oracle import WhoMachine
from tools.test_secret_continuation_io import BASE, x86

ROOT = Path(__file__).resolve().parents[1]
COMMON = ('start', 'who_validate_state', 'who_manual_choice', 'who_commit_choice', 'who_cursor',
          'who_display_current')
FP = ('parse_args','load_effect_text','validate_ack_effect','show_pending_menu','write_pending_outcome',
      'menu_selected','menu_auto','menu_auto_answer','loadbuf','sidecar_fault','fx_physical_len')
CM = ('parse_args','read_effect','validate_effect','read_player_choice','write_outcome',
      'selected','auto_valid','auto_choice','fxbuf','effect_v15','menu_count','menu_opcode')


@pytest.fixture(scope='module', params=['ccmenu','ccfp'])
def frontend(request, tmp_path_factory):
    name = request.param
    exports = COMMON+(FP if name=='ccfp' else CM)
    folder = tmp_path_factory.mktemp('who-'+name)
    source, binary = folder/'probe.asm', folder/'probe.bin'
    source.write_text('cpu 386\nbits 16\norg 100h\ndw '+','.join(exports)
                      +'\n%include "'+name+'.asm"\n', encoding='ascii')
    nasm = shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    run = subprocess.run([nasm, '-I', str(ROOT/'native/src')+'/', '-f', 'bin', str(source),
                          '-o', str(binary)], capture_output=True, text=True, timeout=30)
    assert run.returncode == 0, run.stdout+run.stderr
    data = binary.read_bytes()
    return name, (data, dict(zip(exports, struct.unpack_from('<'+'H'*len(exports), data))))


class Machine(BaseMachine):
    def __init__(self, image, files):
        super().__init__(image, files)
        self.keys = []
        self.buffered = []
        self.after_first_key = []
        self.effect_fault = None
        self.console = bytearray()

    def interrupt(self, uc, number, unused):
        ax = uc.reg_read(x86.UC_X86_REG_AX)
        if number == 0x21 and ax >> 8 == 0x02:
            self.console.append(uc.reg_read(x86.UC_X86_REG_DX)&255)
            return
        if number == 0x21 and ax == 0x6000:
            source = (uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_SI)
            path = self.path(source)
            path = ntpath.normpath(path if ntpath.isabs(path) else 'C:\\'+path)
            target = (uc.reg_read(x86.UC_X86_REG_ES)<<4)+uc.reg_read(x86.UC_X86_REG_DI)
            uc.mem_write(target, path.encode()+b'\0')
            uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)&~1)
            return
        if number == 0x16:
            if ax >> 8 == 1:
                flags=uc.reg_read(x86.UC_X86_REG_EFLAGS)
                uc.reg_write(x86.UC_X86_REG_EFLAGS,flags & ~64 if self.buffered else flags | 64)
                return
            assert ax >> 8 == 0 and (self.buffered or self.keys), 'unexpected manual key request'
            if self.buffered:
                key=self.buffered.pop(0)
            else:
                key=self.keys.pop(0)
                if self.after_first_key:
                    self.buffered=self.after_first_key
                    self.after_first_key=[]
            uc.reg_write(x86.UC_X86_REG_AX,key)
            return
        if number == 0x21 and ax == 0x3D02:
            uc.reg_write(x86.UC_X86_REG_AX, 0x3D00)
        if number == 0x21 and ax >> 8 in (0x40, 0x3E) and self.effect_fault:
            handle = uc.reg_read(x86.UC_X86_REG_BX)
            if self.handles[handle][0].endswith('.EFX'):
                self.fault = self.effect_fault
        return super().interrupt(uc, number, unused)


def pending(bodies, selected=None, flags=None):
    output = bytearray(menu_effect(0x0f)+bytes(16))
    struct.pack_into('<H', output, 4, 16)
    struct.pack_into('<H', output, 120, 13)
    struct.pack_into('<10H', output, 2252, 0x39, 1, 1, *([0]*7))
    struct.pack_into('<10H', output, 5754, 1, 65535, len(bodies), 0x39, 0, 0, 21, 16, 65535, 0x39)
    output[5792:5920] = bytes(128)
    labels = b'\1\4'+b''.join(bytes([b[0]])+b[1:b[0]+1] for b in bodies)
    output[5792:5792+len(labels)] = labels
    struct.pack_into('<H', output, 5790, len(bodies)+1)
    actor = 0 if selected is None else selected+1
    flags = int(selected is not None) if flags is None else flags
    struct.pack_into('<2H', output, 5782, actor, flags)
    struct.pack_into('<4s6H', output, 5932, b'GBSI',1,16,flags,actor,len(bodies),0)
    return bytes(output)


def setup(frontend, output, option=''):
    name, compiled = frontend
    if name=='ccfp':
        output = bytearray(output)
        struct.pack_into('<H', output, 6, struct.unpack_from('<H',output,6)[0]|0x100)
        output = bytes(output)
    files = {'C:\\WHO.EFX': output, 'C:\\ANSWER.GMO': b'acknowledged sentinel'}
    if name=='ccfp': files['C:\\WHO.GBS'] = fixed_stream(output)
    m = Machine(compiled, files)
    tail = ('C:\\WHO.EFX C:\\ANSWER.GMO'+option).encode()
    m.uc.mem_write(BASE+0x80, bytes([len(tail)])+tail+b'\r')
    return m


def admit(frontend, m):
    if frontend[0]=='ccfp':
        m.call('parse_args');m.call('load_effect_text')
        return m.call('validate_ack_effect')
    assert not m.call('parse_args')
    if m.call('read_effect'): return True
    return m.call('validate_effect')


def choose_and_publish(frontend, m, keys):
    m.keys = list(keys)
    if frontend[0]=='ccfp':
        assert not m.call('show_pending_menu')
        return m.call('write_pending_outcome')
    assert not m.call('read_player_choice')
    m.put('selected', struct.pack('<H', m.uc.reg_read(x86.UC_X86_REG_AX)))
    return m.call('write_outcome')


def assert_commit(m, before, chosen):
    expected = bytearray(before)
    if chosen is not None:
        struct.pack_into('<2H', expected, 5782, chosen+1, 1)
        struct.pack_into('<2H', expected, 5940, 1, chosen+1)
    assert bytes(m.files['C:\\WHO.EFX']) == expected
    token = bytes(m.files['C:\\ANSWER.GMO'])
    assert struct.unpack('<4s7H', token) == (b'GBMO',2,65535 if chosen is None else chosen,
                                          struct.unpack_from('<H',before,5758)[0],21,16,65535,0x39)


@pytest.mark.parametrize('initial,keys', [(None,(0x1c0d,)),(0,(0x1c0d,)),(2,(0x1c0d,)),
    (None,(0x5000,0x1c0d)),(None,(0x4800,0x1c0d)),
    (0,(0x5000,0x1c0d)),(2,(0x5000,0x1c0d)),
    (0,(0x4800,0x1c0d)),(2,(0x4800,0x1c0d)),
    (0,(0x0332,0x1c0d)),(0,(0x0938,0x1c0d)),
    (1,(0x011b,0x1c0d))])
def test_manual_frontend_matches_whole_original_selected_identity(frontend, retail, bodies, initial, keys):
    owned = (bodies[5], bodies[1], bodies[4])
    result = WhoMachine(retail).who(owned, keys, selected=initial)
    m = setup(frontend, pending(owned, initial))
    before = bytes(m.files['C:\\WHO.EFX'])
    assert not admit(frontend, m)
    assert not choose_and_publish(frontend, m, keys)
    assert not m.keys
    assert_commit(m, before, result.selected)
    if frontend[0]=='ccfp': assert m.files['C:\\WHO.GBS'] == fixed_stream(before)


@pytest.mark.parametrize('count', [1,3,6])
def test_automatic_choice_is_explicit_absolute_ordinal(frontend, bodies, count):
    m = setup(frontend, pending(bodies[:count]), ' /S'+str(count-1))
    before = bytes(m.files['C:\\WHO.EFX'])
    m.call('start')
    assert m.exit_code == 0 and not m.keys
    assert_commit(m, before, count-1)


@pytest.mark.parametrize('offset,value', [(5932,0),(5936,2),(5938,15),(5940,3),(5942,7),
    (5944,7),(5946,1),(5782,2),(5784,2),(120,1),(5924,2),(5930,1),
    (5756,0x101),(5758,5),(5790,6),(5792,0),(5794,0),(5795,31)])
def test_invalid_profile_state_identity_or_names_preserves_answer(frontend, bodies, offset, value):
    output = bytearray(pending(bodies, 0))
    struct.pack_into('<H', output, offset, value)
    m = setup(frontend, output, ' /S1')
    before = bytes(m.files['C:\\WHO.EFX'])
    assert admit(frontend, m)
    assert m.files['C:\\ANSWER.GMO'] == b'acknowledged sentinel'
    assert m.files['C:\\WHO.EFX'] == before
    assert not any(e['ax'] >> 8 == 0x3C for e in m.events)


@pytest.mark.parametrize('mutation', ['short','long','oversized-short-read'])
def test_exact_effect_extent_rejected_before_commit(frontend, bodies, mutation):
    output = pending(bodies)
    if mutation=='short': output = output[:-1]
    else: output += b'X'
    m = setup(frontend, output)
    if mutation=='oversized-short-read': m.fault='short-read'
    assert admit(frontend, m)
    assert m.files['C:\\ANSWER.GMO'] == b'acknowledged sentinel'


@pytest.mark.parametrize('fault', ['write','short-write','close'])
def test_effect_commit_fault_blocks_token_publication(frontend, bodies, fault):
    m = setup(frontend, pending(bodies,0))
    assert not admit(frontend, m)
    m.effect_fault = fault
    assert choose_and_publish(frontend, m, (0x5000,0x1c0d))
    assert m.files['C:\\ANSWER.GMO'] == b'acknowledged sentinel'
    assert not any(e['ax'] >> 8 == 0x3C for e in m.events)


def test_null_not_found_enter_preserves_existing_state(frontend, bodies):
    m = setup(frontend, pending(bodies,None,2))
    before = bytes(m.files['C:\\WHO.EFX'])
    assert not admit(frontend,m)
    assert not choose_and_publish(frontend,m,(0x1c0d,))
    assert_commit(m,before,None)


def test_nonnull_identity_cannot_be_committed_to_null(frontend,bodies):
    m = setup(frontend,pending(bodies,0))
    before = bytes(m.files['C:\\WHO.EFX'])
    assert not admit(frontend,m)
    m.put('selected' if frontend[0]=='ccmenu' else 'menu_selected',b'\xff\xff')
    assert m.call('write_outcome' if frontend[0]=='ccmenu' else 'write_pending_outcome')
    assert m.files['C:\\WHO.EFX'] == before
    assert m.files['C:\\ANSWER.GMO'] == b'acknowledged sentinel'


@pytest.mark.parametrize('alias', ['C:\\WHO.EFX', 'C:\\SUB\\..\\WHO.EFX'])
def test_who_answer_cannot_truncate_effect_through_canonical_alias(frontend,bodies,alias):
    m = setup(frontend,pending(bodies,0))
    data = ('C:\\WHO.EFX '+alias).encode()
    m.uc.mem_write(BASE+0x80,bytes([len(data)])+data+b'\r')
    before = bytes(m.files['C:\\WHO.EFX'])
    assert not admit(frontend,m)
    assert choose_and_publish(frontend,m,(0x5000,0x1c0d))
    assert m.files['C:\\WHO.EFX'] == before
    assert not any(e['ax'] >> 8 == 0x40 for e in m.events)


def test_invalid_diagnostic_selection_never_invents_nullable_answer(frontend,bodies):
    m = setup(frontend,pending(bodies,None),' /S65535')
    before = bytes(m.files['C:\\WHO.EFX'])
    m.call('start')
    assert m.exit_code != 0
    assert m.files['C:\\WHO.EFX'] == before
    assert m.files['C:\\ANSWER.GMO'] == b'acknowledged sentinel'


def test_current_actor_display_tracks_null_and_each_navigation_change(frontend,bodies):
    owned = (bodies[5],bodies[1],bodies[4])
    m = setup(frontend,pending(owned,None))
    assert not admit(frontend,m)
    m.keys = [0x5000,0x4800,0x1c0d]
    assert not m.call('who_manual_choice',ES=0xA000)
    assert m.uc.reg_read(x86.UC_X86_REG_ES) == 0xA000
    assert m.uc.reg_read(x86.UC_X86_REG_AX) == 2
    name0 = owned[0][1:1+owned[0][0]]
    name2 = owned[2][1:1+owned[2][0]]
    assert bytes(m.console) == (b'Enter selects current actor; Down/2 next; Up/8 previous.\r\n'
        +b'Current: (none selected)\r\nCurrent: 1. '+name0+b'\r\nCurrent: 3. '+name2+b'\r\n')
    assert b'Choose 1..N' not in m.console


def test_initial_nonnull_actor_is_visible_before_enter(frontend,bodies):
    m = setup(frontend,pending(bodies,2))
    assert not admit(frontend,m)
    m.keys = [0x1c0d]
    assert not m.call('who_manual_choice')
    name = bodies[2][1:1+bodies[2][0]]
    assert b'Current: 3. '+name+b'\r\n' in m.console
    assert m.console.count(b'Current: ') == 1


def test_duplicate_actor_names_have_distinct_visible_current_ordinals(frontend,bodies):
    owned=(bodies[1],bodies[1],bodies[4])
    m=setup(frontend,pending(owned,0))
    before=bytes(m.files['C:\\WHO.EFX'])
    assert not admit(frontend,m)
    assert not choose_and_publish(frontend,m,(0x5000,0x1c0d))
    name=owned[0][1:1+owned[0][0]]
    assert b'Current: 1. '+name+b'\r\n' in m.console
    assert b'Current: 2. '+name+b'\r\n' in m.console
    assert_commit(m,before,1)


def test_queued_extra_keys_are_drained_after_each_source_input(frontend,bodies):
    m=setup(frontend,pending(bodies,0))
    before=bytes(m.files['C:\\WHO.EFX'])
    assert not admit(frontend,m)
    m.after_first_key=[0x1c0d,0x5000] # Already queued keys are not a future input step.
    assert not choose_and_publish(frontend,m,(0x5000,0x5000,0x1c0d))
    assert not m.buffered and not m.keys
    assert_commit(m,before,2)


@pytest.mark.parametrize('frontend',['ccfp'],indirect=True)
def test_ccfp_empty_narration_enters_who_without_an_extra_ack(frontend,bodies):
    m=setup(frontend,pending(bodies,None))
    before=bytes(m.files['C:\\WHO.EFX'])
    m.keys=[0x5000,0x1c0d]
    m.call('start')
    assert m.exit_code==0 and not m.keys
    assert_commit(m,before,0)


@pytest.mark.parametrize('frontend',['ccfp'],indirect=True)
def test_ccfp_page_ack_cannot_consume_or_answer_the_next_who(frontend,bodies):
    m=setup(frontend,pending(bodies,None))
    before=bytes(m.files['C:\\WHO.EFX'])
    stream=bytes(m.files['C:\\WHO.GBS'])
    earlier=struct.pack('<10H',0x11,1,1,*([0]*7))+struct.pack('<H',1)+b'P'+bytes(31)
    m.files['C:\\WHO.GBS']=bytearray(struct.pack('<4s2H',b'GBSL',1,2)+earlier+stream[8:])
    m.keys=[0x1c0d,0x5000,0x1c0d]
    m.after_first_key=[0x1c0d] # Repeat from accepted page key, not a WHO answer.
    m.call('start')
    assert m.exit_code==0 and not m.keys and not m.buffered
    assert_commit(m,before,0)
