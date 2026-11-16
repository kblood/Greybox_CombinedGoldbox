"""GSK4 closed wire framing. Structural validity never grants reward authority.

Origin/GBKO, source-resource decoding, complete P1 semantics, replay derivation,
path ownership and typed recovery remain mandatory caller admissions. No I/O.
"""
from dataclasses import dataclass
import struct

HEADER_BYTES = 256
BODY_OFFSET = 1520
SOURCE_MAX = 16 * 1024 * 1024 + 16
STREAM_MAX = 8 + 65535 * 54
COMPLETED_MAX = 16817916
ACTIVE_MAX = 40725548
SIGNED_SEEK_MAX = 0x7fffffff
SETTLED, INTENT = 1, 2
SECTION_KEYS = ('origin', 'answer', 'producer_input', 'producer_output',
                'resource', 'member', 'pre_p1', 'post_p1', 'pre_state',
                'post_state', 'pre_items', 'post_items', 'pre_ledger',
                'post_ledger', 'action', 'rejoin')


def _u16(data, offset):
    return struct.unpack_from('<H', data, offset)[0]


def _u32(data, offset):
    return struct.unpack_from('<I', data, offset)[0]


def _u64(data, offset):
    return struct.unpack_from('<Q', data, offset)[0]


def _need(condition, message):
    if not condition:
        raise ValueError(message)


def checked_add(a, b):
    _need(0 <= a <= 0xffffffff and 0 <= b <= 0xffffffff and a + b <= 0xffffffff,
          'u32 offset overflow')
    return a + b


def expected_pc(phase):
    _need(0 <= phase <= 11, 'unknown phase')
    return 6940 if phase < 2 else 605


def legal_transition(action, pre, post):
    fixed = {1: (0, 0), 2: (0, 1), 3: (1, 2), 4: (2, 3), 5: (3, 4),
             8: (5, 6), 11: (5, 7), 13: (8, 7), 15: (9, 4),
             16: (9, 10), 18: (10, 11), 19: (11, 11),
             21: (5, 4), 23: (7, 8)}
    if action in fixed:
        return (pre, post) == fixed[action]
    if action in (6, 7):
        return pre in (4, 5) and post == pre
    return ((action == 9 and pre == 6 and post in (4, 5)) or
            (action == 10 and pre == 6 and post in (4, 6)) or
            (action == 12 and pre == 8 and post in (4, 7)) or
            (action == 14 and pre == 4 and post in (9, 10)) or
            (action == 20 and pre == 4 and post in (4, 5, 6, 7)) or
            (action == 22 and pre == 7 and post in (4, 5)))


@dataclass(frozen=True)
class RewardRecord:
    """Exact byte images; header directory is rebuilt by encode, not trusted."""
    header: bytes
    paths: bytes
    context: bytes
    sections: tuple[bytes, ...]

    def part(self, key):
        return self.sections[SECTION_KEYS.index(key)]

    @property
    def role(self):
        return _u16(self.header, 6)

    @property
    def prephase(self):
        return _u16(self.header, 24)

    @property
    def postphase(self):
        return _u16(self.header, 26)


def validate_header(h):
    _need(len(h) == 256 and h[:4] == b'GSK4' and _u16(h, 4) == 4,
          'unsupported reward tag/version')
    for off, value in ((8, 4), (10, 1), (12, 256), (14, 16), (20, 11),
                       (22, 32), (50, 16), (52, 604), (54, 605),
                       (56, 18), (58, 12), (60, 80), (62, 0), (80, 1)):
        _need(_u16(h, off) == value, f'header field {off}')
    _need(h[82:128] == bytes(46), 'header reserved bytes')
    role, pre, post, action, result = (_u16(h, off) for off in (6, 24, 26, 28, 30))
    pg, ng = _u64(h, 32), _u64(h, 40)
    _need(role in (SETTLED, INTENT) and pre <= 11 and post <= 11, 'role/phase')
    _need(1 <= _u16(h, 48) <= 6, 'party count')
    _need(all(16 <= _u32(h, off) <= 32768 for off in (64, 68)), 'P1 extent')
    _need(16 <= _u32(h, 72) <= SOURCE_MAX - 16 and _u32(h, 76) == 756,
          'resource extent')
    if role == SETTLED:
        _need(pg > 0 and pg == ng and pre == post and action == result == 0,
              'settled generation/action')
    else:
        _need(pg < 0xffffffffffffffff and ng == pg + 1 and
              legal_transition(action, pre, post) and result in (1, 2, 3),
              'intent transition/generation')
        _need((action == 1) == (pg == 0), 'virtual generation only ACCEPT_ENTRY')
        if action == 19:
            _need(result == 1, 'publication result')


def _validate_parts(r):
    h, s = r.header, r.sections
    _need(len(r.paths) == 1232 and len(r.context) == 32 and len(s) == 16,
          'body shape')
    phase = r.postphase
    for i in (2, 3, 15):
        required = phase >= {2: 1, 3: 2, 15: 11}[i]
        _need(bool(s[i]) == required, f'section {i} presence')
    limits = {0: (64, ACTIVE_MAX), 1: (18, 18), 2: (64, COMPLETED_MAX),
              3: (64, ACTIVE_MAX), 4: (48, 32 + SOURCE_MAX - 16),
              5: (756, 756), 6: (16, 32768), 7: (16, 32768),
              8: (160, 160), 9: (160, 160), 10: (960, 960),
              11: (960, 960), 12: (1056, 1056), 13: (1056, 1056),
              14: (128, 128), 15: (64, COMPLETED_MAX)}
    for i, (low, high) in limits.items():
        if s[i] or i not in (2, 3, 15):
            _need(low <= len(s[i]) <= high, f'section {i} extent')
    _need(len(s[6]) == _u32(h, 64) and len(s[7]) == _u32(h, 68) and
          len(s[4]) == 32 + _u32(h, 72), 'header/section lengths')
    for i in (0, 2, 3, 15):
        if s[i]:
            _need(s[i][:4] == b'GSK3' and _u16(s[i], 4) == 3,
                  'nested record must be GSK3')
    _need(s[1][:4] == b'GBMO' and _u16(s[1], 4) == 2, 'answer tag/version')
    for p1 in (s[6], s[7]):
        _need(p1[:4] == b'GBPR' and _u16(p1, 4) == 3, 'P1 tag/version')
    ri = s[4]
    _need(ri[:4] == b'GBRI', 'resource tag')
    for off, value in ((4, 1), (6, 32), (12, 18), (14, 0), (16, 1), (18, 0)):
        _need(_u16(ri, off) == value, 'resource descriptor')
    _need(_u32(ri, 8) == _u32(h, 72) and _u32(ri, 20) == 756 and
          checked_add(_u32(ri, 24), _u32(ri, 28)) <= _u32(ri, 8),
          'resource member bounds')
    for i, phase in ((8, r.prephase), (9, r.postphase)):
        w = s[i]
        _need(w[:4] == b'GBRW' and _u16(w, 4) == 1 and _u16(w, 6) == 160 and
              _u16(w, 8) == phase and _u16(w, 10) == _u16(h, 48), 'state header')
        _need(w[24:28] == bytes(4) and w[114:] == bytes(46) and
              _u16(w, 100) == 0xffff and _u32(w, 108) & ~7 == 0,
              'state reserved fields')
    count = _u16(h, 48)
    for table in (s[10], s[11]):
        for index in range(12):
            row = table[index * 80:(index + 1) * 80]
            _need(_u16(row, 0) == index and row[2] <= 2 and row[3] <= count and
                  _u16(row, 6) <= 1 and _u16(row, 10) == 0 and row[79] == 0,
                  'item row framing')
    for ledger in (s[12], s[13]):
        _need(ledger[:4] == b'GBRL' and _u16(ledger, 4) == 1 and
              _u16(ledger, 6) == 16 and _u16(ledger, 10) == 32 and
              _u16(ledger, 14) == 0, 'ledger header')
        transfers = _u16(ledger, 8)
        _need(transfers <= 32 and _u16(ledger, 12) == transfers + 1,
              'ledger transfer/epoch count')
        for index in range(32):
            entry = ledger[16+16*index:32+16*index]
            if index >= transfers:
                _need(entry == bytes(16), 'unused transfer')
                continue
            kind, recipient, item, reserved, amount, ordinal = struct.unpack('<4H2I', entry)
            _need(kind in (1, 2) and 1 <= recipient <= count and reserved == 0 and
                  ordinal == index + 1 and amount > 0 and
                  ((kind == 1 and item < 12 and amount == 1) or
                   (kind == 2 and item == 0xffff)), 'transfer framing')
        for index in range(33):
            epoch = ledger[528+16*index:544+16*index]
            if index > transfers:
                _need(epoch == bytes(16), 'unused epoch')
                continue
            n = epoch[1]
            operators = epoch[2:2+n]
            _need(epoch[0] == index and n <= 7 and
                  all(1 <= op <= count + 1 for op in operators) and
                  len(set(operators)) == n and epoch[2+n:] == bytes(14-n),
                  'ordered operator framing')
    a = s[14]
    _need(a[:4] == b'GBRA' and _u16(a, 4) == 1 and _u16(a, 6) == 128,
          'action header')
    _need(a[30:32] == bytes(2) and a[42:] == bytes(86), 'action reserved')
    _need(_u64(a, 8) == _u64(h, 32) and _u16(a, 16) == r.prephase and
          _u16(a, 18) == _u16(h, 28) and _u16(a, 28) == _u16(h, 30) and
          _u16(a, 36) == _u16(h, 48) and _u16(a, 38) == 16 and
          _u16(a, 40) == expected_pc(r.prephase), 'action/header identity')
    if _u16(h, 28) not in (6, 7, 10, 12):
        _need(_u16(a, 20) == 0, 'unused recipient')
    if _u16(h, 28) != 10:
        _need(_u16(a, 22) == 0xffff, 'unused item')
    if _u16(h, 28) != 12:
        _need(_u32(a, 24) == 0, 'unused value')
    if r.role == SETTLED or _u16(h, 28) == 19:
        _need(all(s[i] == s[i + 1] for i in (6, 8, 10, 12)), 'paired images')
    if _u16(h, 28) == 19:
        _need(_u16(s[8], 16) == 0, 'publication pending items')


def decode(data):
    _need(len(data) >= BODY_OFFSET, 'short reward record')
    h = data[:256]
    validate_header(h)
    _need(_u32(h, 16) == len(data) <= SIGNED_SEEK_MAX, 'exact EOF/signed seek')
    end, parts = BODY_OFFSET, []
    for i in range(16):
        off, size = struct.unpack_from('<II', h, 128 + 8 * i)
        if size:
            _need(off == end, 'directory hole/overlap/order')
            end = checked_add(off, size)
            _need(end <= len(data), 'directory outside EOF')
            parts.append(data[off:end])
        else:
            _need(off == 0, 'absent section offset')
            parts.append(b'')
    _need(end == len(data), 'trailing bytes')
    r = RewardRecord(h, data[256:1488], data[1488:1520], tuple(parts))
    _validate_parts(r)
    return r


def encode(record):
    """Canonical directory, exact input bytes, no replay or normalization."""
    validate_header(record.header)
    _validate_parts(record)
    h, end = bytearray(record.header), BODY_OFFSET
    for i, part in enumerate(record.sections):
        struct.pack_into('<II', h, 128 + 8 * i, end if part else 0, len(part))
        end = checked_add(end, len(part))
    _need(end <= SIGNED_SEEK_MAX, 'signed seek overflow')
    struct.pack_into('<I', h, 16, end)
    return bytes(h) + record.paths + record.context + b''.join(record.sections)
