"""Compiled CCNEXT metric bridge controls; child query arithmetic is a model.
Production CCPARTY arithmetic and DOS execution require separate verification.
"""
from dataclasses import replace
import struct
import pytest
from tools.secret_continuation import Context, encode, decode, projected_roster, Phase, bind_result
from tools.test_secret_continuation import prepared, inputs, result
from tools.test_secret_continuation_coordinator import image, Machine, setup, completed_record, close_source
from tools.test_secret_continuation_io import x86


class MetricMachine(Machine):
    metric_fault = None
    def interrupt(self, uc, num, arg):
        ax = uc.reg_read(x86.UC_X86_REG_AX)
        if ax >> 8 in (0x3f,0x3e,0x42) and self.metric_fault in ('read','close','seek'):
            handle = self.handles.get(uc.reg_read(x86.UC_X86_REG_BX))
            wanted = {'read':0x3f,'close':0x3e,'seek':0x42}[self.metric_fault]
            if handle and handle[0].endswith('STAT.GSM') and ax >> 8 == wanted:
                if self.metric_fault == 'close': super().interrupt(uc,num,arg)
                uc.reg_write(x86.UC_X86_REG_AX,5)
                uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)|1)
                return
        if ax >> 8 == 0x41 and self.metric_fault == 'delete':
            path = self.path((uc.reg_read(x86.UC_X86_REG_DS) << 4) + uc.reg_read(x86.UC_X86_REG_DX))
            if path.endswith('STAT.GSM'):
                uc.reg_write(x86.UC_X86_REG_AX, 5)
                uc.reg_write(x86.UC_X86_REG_EFLAGS, uc.reg_read(x86.UC_X86_REG_EFLAGS) | 1)
                return
        if ax == 0x4B00:
            path = self.path((uc.reg_read(x86.UC_X86_REG_DS) << 4) + uc.reg_read(x86.UC_X86_REG_DX))
            query = path.endswith('CCPARTY.COM') and self.get('kn_tail',128)[1:5] == b' /V '
            super().interrupt(uc, num, arg)
            if query:
                self.metric_inputs.append(bytes(self.files[self.record.paths[1]]))
                reply = self.children[-1][1].split()[2]
                raw = self.files[reply]
                if hasattr(self,'metric_override'): struct.pack_into('<H',raw,8,self.metric_override)
                if self.metric_fault in ('stale', 'absent'): del self.files[reply]
                elif self.metric_fault == 'short': del raw[-1]
                elif self.metric_fault == 'extra': raw += b'X'
                elif self.metric_fault == 'magic': raw[:4] = b'XXXX'
                elif self.metric_fault in ('version', 'length', 'value', 'count', 'roster', 'reserved'):
                    offsets = {'version':4, 'length':6, 'value':8, 'count':10, 'roster':12, 'reserved':14}
                    struct.pack_into('<H', raw, offsets[self.metric_fault], 256 if self.metric_fault == 'value' else 65535)
                self.metric_values.append(struct.unpack_from('<H', raw, 8)[0] if len(raw) >= 10 else None)
            return
        if ax >> 8 == 0x4D and self.children and self.children[-1][0].endswith('CCPARTY.COM') and self.children[-1][1].startswith(' /V ') and self.metric_fault == 'child':
            uc.reg_write(x86.UC_X86_REG_AX, 1)
            return
        return super().interrupt(uc, num, arg)


def completed_machine(image, p, fault=None, raw_result=None):
    original = setup(image, p)
    m = MetricMachine(image, {k:bytes(v) for k,v in original.files.items()}, p)
    for label, path in [('kn_descriptor','C:\\DESC.BIN'),('kn_expected_roster',p.paths[1]),
                        ('kn_expected_source',p.paths[0]),('kn_response','C:\\NEXT.BIN'),('kn_prefix','C:\\')]:
        m.put(label, path.encode()+b'\0')
    m.metric_inputs, m.metric_values = [], []
    assert not m.call('kn_prepare')
    close_source(m)
    raw_result = result(p) if raw_result is None else raw_result
    b = bind_result(p,raw_result,b'party\r\n')
    m.files[p.paths[8]] = bytearray(encode(b))
    m.files[p.paths[3]] = bytearray(raw_result[:14]+b'\1\0'+raw_result[16:])
    m.files[p.paths[6]] = bytearray(b'party\r\n')
    m.files[p.paths[1]] = bytearray(projected_roster(b, raw_result))
    del m.files['C:\\PARTY.GSC']
    m.metric_fault = fault
    return m


@pytest.mark.parametrize('fault', ['read','close','seek','child','delete','absent','stale','short','extra','magic',
                                   'version','length','value','count','roster','reserved'])
def test_metric_failure_preserves_completed_authority_and_settled_party(image, prepared, fault):
    m = completed_machine(image, prepared, fault)
    m.directories.add('C:\\WORK')
    # Workspace OWNER is created/admitted by kn_resume before this fixed scratch.
    m.files['C:\\WORK\\STAT.GSM'] = bytearray(struct.pack('<4s6H',b'GBSM',1,16,255,6,len(m.files[prepared.paths[1]]),0))
    authority, party = bytes(m.files[prepared.paths[8]]), bytes(m.files[prepared.paths[1]])
    assert m.call('kn_resume')
    assert bytes(m.files[prepared.paths[8]]) == authority
    assert bytes(m.files[prepared.paths[1]]) == party
    assert not any(path.endswith('CCFLOW.COM') for path, _ in m.children)
    assert all(handle[0] == prepared.paths[8] for handle in m.handles.values())
    close_source(m)
    assert not m.handles


def test_metric_uses_settled_hp_and_does_not_freeze_z_context(image, prepared):
    m = completed_machine(image, prepared)
    settled = bytes(m.files[prepared.paths[1]])
    assert not m.call('kn_resume')
    assert m.metric_inputs == [settled]
    assert len(m.metric_values) == 1
    assert f' /Z{m.metric_values[0]}' in m.children[-1][1]
    record = decode(bytes(m.files[prepared.paths[8]]))
    assert record.phase == Phase.ACTIVE and record.context == Context()
    assert not record.context.flags & 1
    close_source(m)
    before = len(m.metric_inputs)
    assert not m.call('kn_resume')
    assert len(m.metric_inputs) == before  # no producer transition on repeat READY


def test_explicit_z_bypasses_metric_child_and_retains_full_width(image, prepared):
    p = replace(prepared, context=Context(1,z=65535))
    m = completed_machine(image, p, 'child')
    assert not m.call('kn_resume')
    assert not m.metric_inputs and ' /Z65535' in m.children[-1][1]
    assert decode(bytes(m.files[p.paths[8]])).context == p.context


def test_maximum_absent_z_tail_includes_three_digit_metric_with_replay_room(image, prepared):
    context = Context(126,0,65535,255,255,255,255,65535)
    p = replace(prepared, context=context, interactive=True)
    m = completed_machine(image, p)
    m.metric_override = 255
    assert not m.call('kn_resume')
    header = bytearray(m.get('kr_header',64))
    struct.pack_into('<H',header,14,65535)
    m.put('kr_header',bytes(header))
    assert not m.call('kn_build_producer_tail')
    data = m.get('kn_tail',128)
    tail = data[1:1+data[0]].decode()
    assert len(tail) == 109 and len(tail)+12 <= 126
    assert ' /Z255' in tail
    assert ' /Z' in tail and decode(bytes(m.files[p.paths[8]])).context == context


def test_two_durable_hp_postimages_produce_different_fresh_metrics(image, prepared):
    first = completed_machine(image, prepared)
    lower = bytearray(result(prepared))
    for i in range(prepared.count):
        offset = 16+i*6+2
        hp = struct.unpack_from('<H',lower,offset)[0]
        struct.pack_into('<H',lower,offset,max(0,hp-10))
    second = completed_machine(image, prepared, raw_result=bytes(lower))
    assert not first.call('kn_resume') and not second.call('kn_resume')
    assert first.metric_inputs != second.metric_inputs
    assert first.metric_values != second.metric_values
    assert decode(bytes(first.files[prepared.paths[8]])).context == Context()
    assert decode(bytes(second.files[prepared.paths[8]])).context == Context()


def test_retry_discards_previous_closed_metric_and_queries_current_p1(image, prepared):
    m = completed_machine(image, prepared, 'child')
    assert m.call('kn_resume')
    close_source(m)
    assert 'C:\\WORK\\STAT.GSM' in m.files
    m.metric_fault = None
    assert not m.call('kn_resume')
    assert len(m.metric_inputs) == 2 and m.metric_inputs[0] == m.metric_inputs[1]
    queries = [tail for path,tail in m.children if path.endswith('CCPARTY.COM') and tail.startswith(' /V ')]
    assert len(queries) == 2
