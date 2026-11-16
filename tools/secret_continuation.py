"""Pure reference contract for the native Secret continuation coordinator.

This module performs no filesystem mutation. Immutable prepared, completed
and active records retain exact inputs
until a validated successor replaces them. Native publication must be atomic;
an effect file's existence alone never authorizes a transition to ACTIVE.
"""
from dataclasses import dataclass, replace
from enum import IntEnum
import struct

from tools.secret_roster import decode as decode_roster, update_hp

PATH_BYTES = 112
PATH_KEYS = ('source', 'roster', 'request', 'result', 'paused', 'seed',
             'outcome', 'successor', 'authority', 'workdir')
SECTION_KEYS = ('request', 'roster', 'paused', 'seed', 'identity', 'result',
                'outcome', 'successor', 'stream', 'receipt')
HEADER = struct.Struct('<4s10H10I')
RECEIPT_HEADER = struct.Struct('<4sHH4I')
PATH_TABLE_BYTES = len(PATH_KEYS) * PATH_BYTES
CONTEXT_HEADER = struct.Struct('<4s14H')
CONTEXT_BYTES = CONTEXT_HEADER.size
CONTEXT_OFFSET = HEADER.size + PATH_TABLE_BYTES
BODY_OFFSET = CONTEXT_OFFSET + CONTEXT_BYTES
MAX_SOURCE = 16 * 1024 * 1024


class Phase(IntEnum):
    PREPARED = 0
    COMPLETED = 1
    ACTIVE = 2


def path_bytes(value: str) -> bytes:
    """Only absolute canonical DOS paths, with no aliasing dot segments."""
    try:
        raw = value.encode('ascii')
    except UnicodeEncodeError as exc:
        raise ValueError('non-ASCII DOS path') from exc
    if (not 3 <= len(raw) < PATH_BYTES or value[1:3] != ':\\'
            or not value[0].isascii() or not value[0].isalpha()
            or any(c in value for c in '/ *?"<>|+,;=[]')
            or any(ord(c) < 33 or ord(c) > 126 for c in value)):
        raise ValueError('noncanonical DOS path')
    devices = {'CON', 'PRN', 'AUX', 'NUL', 'CLOCK$'}
    devices.update(f'{kind}{i}' for kind in ('COM', 'LPT') for i in range(1, 10))
    for part in (value[3:].split('\\') if value[3:] else []):
        if not part or part in ('.', '..') or part.endswith('.') or ':' in part:
            raise ValueError('aliased DOS path')
        pieces = part.split('.')
        if len(pieces) > 2 or not 1 <= len(pieces[0]) <= 8 or (len(pieces) == 2 and len(pieces[1]) > 3):
            raise ValueError('DOS path is not canonical 8.3')
        if pieces[0].upper() in devices:
            raise ValueError('DOS device aliases a file')
    return raw + bytes(PATH_BYTES - len(raw))


def read_path(raw: bytes) -> str:
    if len(raw) != PATH_BYTES or b'\0' not in raw:
        raise ValueError('unterminated DOS path')
    head = raw.split(b'\0', 1)[0]
    try:
        value = head.decode('ascii')
    except UnicodeDecodeError as exc:
        raise ValueError('non-ASCII DOS path') from exc
    if path_bytes(value) != raw:
        raise ValueError('nonzero DOS path padding')
    return value


def sibling(path: str, extension: str) -> str:
    last = path.rsplit('\\', 1)[-1]
    if '.' not in last:
        raise ValueError('owned pathname lacks extension')
    return path.rsplit('.', 1)[0] + '.' + extension


def check_paths(paths: tuple[str, ...]) -> None:
    if len(paths) != len(PATH_KEYS):
        raise ValueError('wrong path table size')
    for path in paths:
        path_bytes(path)
    folded = [p.upper() for p in paths]
    if len(set(folded)) != len(folded):
        raise ValueError('continuation paths alias')
    p = dict(zip(PATH_KEYS, folded))
    if any(p[key].endswith('\\') for key in PATH_KEYS if key != 'workdir'):
        raise ValueError('file pathname names a root directory')
    if not p['roster'].endswith('.GBP') or p['authority'] != sibling(p['roster'], 'GSK'):
        raise ValueError('authority is not owned by this roster')
    protected = set(folded)
    for extension in ('GSJ', 'GSB', 'GSN', 'GST', 'GSC', 'GSD'):
        path_bytes(sibling(p['roster'], extension))
        if sibling(p['roster'], extension) in protected:
            raise ValueError('continuation aliases HP transaction')
    for name in ('paused', 'successor'):
        for extension in ('IDN', 'DOP', 'GBS', 'GBT', 'GBP'):
            path_bytes(sibling(p[name], extension))
            if sibling(p[name], extension) in protected:
                raise ValueError('continuation aliases effect sibling')
    if sibling(p['paused'], 'IDN') == sibling(p['successor'], 'IDN'):
        raise ValueError('paused and successor stems alias')
    owned_scratch = {p['workdir'].rstrip('\\') + '\\' + name for name in
                     ('W.GWN', 'O.EFX', 'O.GBS', 'O.GBT', 'O.GBP', 'OUTPUT.EFX', 'OUTPUT.GBS', 'OUTPUT.GBT', 'OUTPUT.GBP', 'A.OUT', 'STAT.GSM', 'GBR.EFX', 'INPUT.EFX', 'INPUT.IDN', 'SEED.BIN', 'SRC.GLB', 'SRC.GNG', 'SRC.GOG',
                      'OUTCOME.OUT', 'CCFLOW.COM', 'CCECL.COM')}
    owned_scratch.update(sibling(p['authority'], ext) for ext in ('GKT', 'GKB', 'GKO'))
    for scratch in owned_scratch:
        path_bytes(scratch)
    if owned_scratch & protected:
        raise ValueError('continuation aliases coordinator scratch')


def selection(data: bytes) -> tuple[int, int, int]:
    """Old v9 has no actor authority; v15 retains its original GBMS meaning."""
    version = struct.unpack_from('<H',data,4)[0]
    if version == 9: return (0,0,0)
    flags, actor = struct.unpack_from('<H',data,5784)[0], struct.unpack_from('<H',data,5782)[0]
    if version != 16: return (flags,actor,0)
    magic, revision, length, si_flags, si_actor, count, reserved = struct.unpack_from('<4s6H',data,5932)
    if (magic,revision,length,reserved) != (b'GBSI',1,16,0) or flags != si_flags or actor != si_actor:
        raise ValueError('selected actor suffix differs from GBMS')
    if flags not in (0,1,2) or not 1 <= count <= 6 or (flags == 1 and not 1 <= actor <= count) or (flags != 1 and actor):
        raise ValueError('invalid nullable selected actor')
    return flags,actor,count


def check_actor_binding(data: bytes, roster) -> None:
    if struct.unpack_from('<H',data,4)[0] != 16: return
    if selection(data)[2] != len(roster.heroes):
        raise ValueError('selected actor count differs from owned P1')
    if struct.unpack_from('<H',data,8)[0] != 2 or struct.unpack_from('<H',data,5760)[0] != 0x39: return
    count = len(roster.heroes)
    if struct.unpack_from('<H',data,5758)[0] != count:
        raise ValueError('WHO menu count differs from owned P1')
    cursor = 5792
    cursor += 1+data[cursor]  # packed prompt
    for hero in roster.heroes:
        name = hero.body[1:1+hero.body[0]]
        length = data[cursor]
        if data[cursor+1:cursor+1+length] != name:
            raise ValueError('WHO labels differ from owned P1 row order')
        cursor += 1+length


def check_effect(data: bytes, area: int, *, pending: bool) -> None:
    if len(data) < 10 or data[:4] != b'GBEF':
        raise ValueError('short Secret effect')
    version = struct.unpack_from('<H', data, 4)[0]
    if (version, len(data)) not in ((9, 5750), (15, 5932), (16, 5948)):
        raise ValueError('unsupported Secret effect extent/version')
    status = struct.unpack_from('<H', data, 8)[0]
    if ((version == 9 and status not in (0, 1, 3))
            or (version == 15 and status != 2)
            or (version == 16 and status not in (0,1,2,3))
            or (pending and (version not in (9,16) or status != 3))):
        raise ValueError('wrong continuation effect state')
    if data[116:120] != b'GBRS' or struct.unpack_from('<H', data, 122)[0] != area:
        raise ValueError('effect area/state ownership mismatch')
    flags = struct.unpack_from('<H', data, 120)[0]
    if (flags & ~1) != 12:
        raise ValueError('effect lacks Secret long-frame/RNG semantic revision')
    if status in (2, 3) and not flags & 1:
        raise ValueError('effect lacks resumable VM state')
    calls, memory = (struct.unpack_from('<H', data, offset)[0] for offset in (130, 196))
    if calls > 32 or memory > 512:
        raise ValueError('invalid VM extent')
    if data[2246:2250] != b'GBSX' or struct.unpack_from('<H', data, 2250)[0] > 64:
        raise ValueError('invalid inline event extent')
    if data[5720:5724] != b'GBHD' or struct.unpack_from('<H', data, 5724)[0] != 0:
        raise ValueError('invalid, halted or looping continuation')
    if data[5708:5712] != b'GBES' or data[5732:5736] != b'GBCL':
        raise ValueError('effect lacks setup/clock state')
    if struct.unpack_from('<H', data, 32)[0] > 8 or struct.unpack_from('<H', data, 82)[0] > 8:
        raise ValueError('invalid encounter/NPC extent')
    if version == 16:
        selection(data)
        if data[5920:5924] != b'GBRF' or any(v > 1 for v in data[5924:5930]) or any(data[5930:5932]):
            raise ValueError('invalid v16 raw comparison flags')
    if status == 2:
        check_menu(data)


def check_menu(data: bytes) -> None:
    """CCECL read_resume_menu and CCFLOW terminal identity, without an answer.

    Secret WHO remains unsupported. DoK acknowledgement (1d) is foreign:
    Secret PARTY_STRENGTH stores a value without yielding; long PARTY_SURPRISE
    and zero-operand 31h are not menus.
    """
    word = lambda offset: struct.unpack_from('<H', data, offset)[0]
    if (data[5774:5778] != b'GBMS' or word(5784) & ~3
            or data[5920:5924] != b'GBRF' or any(v > 1 for v in data[5924:5930])
            or word(5930) or data[5750:5754] != b'GBMN'):
        raise ValueError('invalid Secret menu state suffix')
    flags, dest, count, opcode, index, reserved, pc, area, id_dest, id_opcode = struct.unpack_from('<10H', data, 5754)
    events = word(2250)
    if (not 1 <= events <= 64 or index != events - 1
            or (pc, area, id_dest, id_opcode) != (word(124), word(122), dest, opcode)):
        raise ValueError('menu continuation identity differs')
    event = struct.unpack_from('<10H', data, 2252 + index * 20)
    if event[0] != opcode:
        raise ValueError('pending menu event differs')
    if opcode not in (0x0f, 0x10, 0x15, 0x2b, 0x2c, 0x39):
        raise ValueError('unsupported Secret menu opcode')
    if not 0 <= count <= 255 or (count == 0 and opcode != 0x0f):
        raise ValueError('invalid menu choice extent')
    if opcode == 0x39:
        if len(data) != 5948 or dest != 65535 or count != selection(data)[2]:
            raise ValueError('WHO requires v16 actor capability')
    if opcode == 0x22:
        if (flags, dest, count, event[1]) != (3, 65535, 2, 0) or reserved & ~3:
            raise ValueError('invalid yes/no menu')
    elif flags != 1 or reserved:
        raise ValueError('invalid ordinary menu flags')
    if opcode == 0x15:
        valid_event = event[1] >= 3 and event[2] == dest and event[4] == count
    elif opcode == 0x0f:
        valid_event = count == 0 and event[1] >= 2 and event[3] == dest
    elif opcode == 0x10:
        valid_event = event[1] == 2 and (event[2], event[3]) == (count, dest)
    elif opcode == 0x2c:
        valid_event = event[1] >= 6 and event[7] == dest and count == 5
    elif opcode == 0x39:
        valid_event = event[1] == 1 and 1 <= event[2] <= 128
    elif opcode == 0x22:
        valid_event = True
    else:
        valid_event = event[1] >= 2 and (event[2], event[3]) == (dest, count)
    if not valid_event:
        raise ValueError('menu event operands differ')
    text_count = 0 if opcode in (0x0f, 0x10) else count + int(opcode in (0x15, 0x22, 0x39))
    if data[5786:5790] != b'GBMT' or word(5790) != text_count:
        raise ValueError('invalid menu text count')
    cursor, segments = 5792, []
    for _ in range(text_count):
        if cursor >= 5920 or cursor + 1 + data[cursor] > 5920:
            raise ValueError('menu text exceeds its fixed bank')
        length = data[cursor]
        segments.append(data[cursor + 1:cursor + 1 + length])
        cursor += 1 + length
    if any(data[cursor:5920]):
        raise ValueError('nonzero menu text padding')
    if opcode == 0x39 and len(segments[0]) != event[2]:
        raise ValueError('WHO prompt metadata differs from text bank')
    if opcode == 0x22 and segments[1:] != [b'\x64\x54\xc0', b'\x38\xf0\0']:
        raise ValueError('yes/no text differs from native labels')


def packed_count(data: bytes, codec: int = 1) -> int:
    """Closed legacy1 stop-zero / original Secret2 skip-zero, clamp255."""
    if codec not in (1, 2):
        raise ValueError('unsupported packed-text codec')
    bits, available, count = 0, 0, 0
    for byte in data:
        bits = (bits << 8) | byte
        available += 8
        while available >= 6:
            available -= 6
            if ((bits >> available) & 63) == 0:
                if codec == 1:
                    return count
                continue
            if codec == 1 or count < 255:
                count += 1
    return count


def check_stream(stream: bytes, successor: bytes) -> None:
    """Validate the closed GBS bundle, including embedded v2 GBPX payload.

    v1's u16 count permits extents above 64 KiB; v2 uses the native 16-bit
    containing-file extent and 1,213-row limit. No sibling GBP is an input.
    """
    have_stream = bool(struct.unpack_from('<H', successor, 6)[0] & 0x100)
    if have_stream != bool(stream):
        raise ValueError('effect/stream publication flags differ')
    if not stream:
        # DREF/GBPX sentinels are private until the complete stream exists.
        for index in range(struct.unpack_from('<H', successor, 2250)[0]):
            if struct.unpack_from('<H', successor, 3532 + index * 34)[0] > 32:
                raise ValueError('inline effect contains private text reference')
        return
    if len(stream) < 8 or stream[:4] != b'GBSL':
        raise ValueError('short successor stream')
    version, count = struct.unpack_from('<2H', stream, 4)
    end = 8 + count * 54
    if not count or version not in (1, 2) or end > len(stream):
        raise ValueError('invalid successor stream header')
    records = [stream[8+i*54:8+(i+1)*54] for i in range(count)]
    if version == 1:
        if end != len(stream) or any(struct.unpack_from('<H', row, 20)[0] > 32 for row in records):
            raise ValueError('invalid fixed successor stream')
    else:
        if count > 1213 or len(stream) > 65535 or end + 12 > len(stream):
            raise ValueError('v2 stream exceeds native extent')
        magic, ext_version, tags, payload_len, reserved = struct.unpack_from('<4s4H', stream, end)
        payload_base = end + 12 + tags * 8
        if magic != b'GBPX' or ext_version not in (1, 2) or reserved or not 1 <= tags <= count or payload_base + payload_len != len(stream):
            raise ValueError('invalid embedded packed-text extension')
        if ext_version == 2:
            if len(successor) != 5948 or struct.unpack_from('<H', successor, 4)[0] != 16:
                raise ValueError('Secret codec requires typed v16 effect')
            check_effect(successor, struct.unpack_from('<H', successor, 122)[0], pending=False)
        seen_tags, seen_payload = 0, 0
        for index, row in enumerate(records):
            length = struct.unpack_from('<H', row, 20)[0]
            if length <= 32:
                continue
            if (length != 65535 or struct.unpack_from('<H', row)[0] not in (0x11, 0x12)
                    or row[22:26] != b'GBPX' or struct.unpack_from('<H', row, 26)[0] != seen_tags
                    or any(row[28:]) or seen_tags >= tags):
                raise ValueError('invalid published packed-text tag')
            owner, offset, packed_len, decoded_len = struct.unpack_from('<4H', stream, end + 12 + seen_tags * 8)
            if (owner, offset) != (index, seen_payload) or not 1 <= packed_len <= 255 or decoded_len <= 32 or offset + packed_len > payload_len:
                raise ValueError('invalid packed-text directory ownership')
            if packed_count(stream[payload_base+offset:payload_base+offset+packed_len], ext_version) != decoded_len:
                raise ValueError('packed-text decoded length differs')
            seen_tags += 1
            seen_payload += packed_len
        if (seen_tags, seen_payload) != (tags, payload_len):
            raise ValueError('packed-text extension has unowned bytes')
    # CCFLOW appends the terminal chunk in order. Long references are rewritten
    # in GBS, so bind events exactly; inline text remains byte-identical.
    chunk_count = struct.unpack_from('<H', successor, 2250)[0]
    if chunk_count > count:
        raise ValueError('stream lacks terminal effect chunk')
    for index in range(chunk_count):
        row = records[count - chunk_count + index]
        if row[:20] != successor[2252+index*20:2272+index*20]:
            raise ValueError('stream terminal events differ')
        text = successor[3532+index*34:3566+index*34]
        if struct.unpack_from('<H', text)[0] <= 32:
            if row[20:] != text:
                raise ValueError('stream terminal text differs')
        else:
            # Match resolve_reference's private input framing. The published
            # row must name the embedded directory, never another scratch file.
            ref_area, ref_offset, ref_length, ref_raw = struct.unpack_from('<4H', text, 6)
            if (version != 2 or struct.unpack_from('<H', text)[0] != 65535
                    or text[2:6] != b'DREF' or row[22:26] != b'GBPX'
                    or struct.unpack_from('<H', row, 20)[0] != 65535
                    or ref_area > 255 or not 1 <= ref_length <= 255
                    or ref_offset + ref_length > ref_raw or any(text[14:])):
                raise ValueError('stream does not resolve private terminal text')
            tag = struct.unpack_from('<H', row, 26)[0]
            if struct.unpack_from('<H', stream, end + 12 + tag * 8 + 4)[0] != ref_length:
                raise ValueError('published text differs from private operand extent')


def source_member(source: bytes, area: int) -> bytes:
    """Resolve the method-zero GLIB archive used by the proven native route."""
    if len(source) < 28 or source[:4] != b'GLIB':
        raise ValueError('short GLIB source')
    size, members, method, kind = struct.unpack_from('>IHBB', source, 4)
    if size != len(source) or method or kind != 1 or not 2 <= members <= 256:
        raise ValueError('unsupported GLIB source header')
    pointer_end = 16 + 4 * (members + 1)
    if pointer_end > len(source):
        raise ValueError('short source pointer table')
    pointers = struct.unpack_from('>' + 'I' * (members + 1), source, 16)
    if pointers[0] < pointer_end or pointers[-1] != len(source) or any(
            a > b or b > len(source) for a, b in zip(pointers, pointers[1:])):
        raise ValueError('source pointer ownership differs')
    table = source[pointers[0]:pointers[1]]
    if len(table) < 2:
        raise ValueError('short source area table')
    count = struct.unpack_from('>H', table)[0]
    if len(table) != 2 + count * 4:
        raise ValueError('source area table extent differs')
    entries = [struct.unpack_from('>HH', table, 2 + i * 4) for i in range(count)]
    if len({key for key, _ in entries}) != count or any(not 1 <= index < members for _, index in entries):
        raise ValueError('ambiguous or invalid source area table')
    matches = [index for key, index in entries if key == area]
    if len(matches) != 1:
        raise ValueError('source does not own this area')
    index = matches[0]
    member = source[pointers[index]:pointers[index + 1]]
    if not 20 <= len(member) <= 16000:
        raise ValueError('source member exceeds native ECL bounds')
    return member


def check_source_pc(identity: bytes, effect: bytes, area: int) -> None:
    member = source_member(identity[16:], area)
    pc = struct.unpack_from('<H', effect, 124)[0]
    if not 20 <= pc <= len(member):
        raise ValueError('VM PC is outside its bound source member')


@dataclass(frozen=True)
class Context:
    flags: int = 0
    z: int = 0
    l: int = 0
    c: int = 0
    y: int = 0
    o: int = 0
    w: int = 0
    host_answer: int = 0


def check_context(context: Context) -> None:
    if type(context) is not Context:
        raise ValueError('continuation context must be immutable Context')
    values = (context.z, context.l, context.c, context.y,
              context.o, context.w, context.host_answer)
    if type(context.flags) is not int or not 0 <= context.flags <= 0x7f:
        raise ValueError('invalid context presence flags')
    for index, value in enumerate(values):
        maximum = 255 if 2 <= index <= 5 else 65535
        if type(value) is not int or not 0 <= value <= maximum:
            raise ValueError('invalid context scalar width')
        if not context.flags & (1 << index) and value:
            raise ValueError('absent context scalar has a value')
    if bool(context.flags & 4) != bool(context.flags & 64):
        raise ValueError('context C and host answer presence differs')
    if context.flags & 64 and (context.host_answer & 255) != context.c:
        raise ValueError('context C differs from host answer low byte')


def encode_context(context: Context, interactive: bool) -> bytes:
    check_context(context)
    return CONTEXT_HEADER.pack(b'GBCX', 1, CONTEXT_BYTES, context.flags,
        context.z, context.l, context.c, context.y, context.o, context.w,
        context.host_answer, int(interactive), 0, 0, 0)


def decode_context(data: bytes, interactive: bool) -> Context:
    if len(data) != CONTEXT_BYTES:
        raise ValueError('short continuation context')
    magic, version, length, flags, z, l, c, y, o, w, host, mode, *reserved = CONTEXT_HEADER.unpack(data)
    if (magic, version, length) != (b'GBCX', 1, CONTEXT_BYTES) or mode != int(interactive) or any(reserved):
        raise ValueError('invalid context framing/menu mode')
    context = Context(flags, z, l, c, y, o, w, host)
    check_context(context)
    return context


@dataclass(frozen=True)
class Continuation:
    phase: Phase
    area: int
    count: int
    paths: tuple[str, ...]
    sections: tuple[bytes, ...]
    interactive: bool = False
    resume_kind: int = 0  # 0 completed real combat, 1 menu answer, 2 empty combat
    context: Context = Context()

    def part(self, key: str) -> bytes:
        return self.sections[SECTION_KEYS.index(key)]


def projected_roster(record: Continuation, result: bytes) -> bytes:
    roster = record.part('roster')
    if len(result) < 16:
        raise ValueError('short completion')
    magic, version, outcome, xp, count, length, consumed = struct.unpack_from('<4s6H', result)
    if (magic, version, xp, count, length) != (b'GBCR', 3, 0, record.count, len(roster)):
        raise ValueError('foreign completion identity')
    if outcome > 3 or consumed not in (0, 1) or len(result) != 16 + count * 6 + length:
        raise ValueError('invalid completion extent/flags')
    if result[16 + count * 6:] != roster:
        raise ValueError('completion preimage differs')
    heroes = decode_roster(roster).heroes
    hp = []
    for i, hero in enumerate(heroes):
        ordinal, condition, current, maximum = struct.unpack_from('<BBHH', result, 16 + i * 6)
        if ordinal != i or condition > 3 or maximum != hero.body[112] or current > maximum:
            raise ValueError('invalid completion HP row')
        hp.append(current)
    return update_hp(roster, tuple(hp))


def check_menu_outcome(paused: bytes, outcome: bytes) -> None:
    """CCECL's exact GBMO2 one-shot menu token, read without consuming it."""
    if len(outcome) != 18:
        raise ValueError('menu answer must be exactly GBMO2')
    magic, version, selected, count, pc, area, dest, opcode = struct.unpack('<4s7H', outcome)
    expected_count = struct.unpack_from('<H', paused, 5758)[0]
    identity = struct.unpack_from('<4H', paused, 5766)
    if magic != b'GBMO' or version != 2 or count != expected_count or (pc, area, dest, opcode) != identity:
        raise ValueError('menu answer identity differs')
    nullable = opcode == 0x39 and len(paused) == 5948 and selected == 65535 and selection(paused)[0] != 1
    if not nullable and not (opcode == 0x0f and count == 0) and selected >= count:
        raise ValueError('menu answer selection exceeds choice extent')
    if opcode == 0x39 and not nullable and selection(paused)[:2] != (1,selected+1):
        raise ValueError('WHO token differs from committed selected identity')
    if opcode == 0x10 and selected != 0:
        raise ValueError('string answer lacks native committed-text token')
    if opcode == 0x10:
        committed_string(paused)


def committed_string(effect: bytes, *, maximum: int | None = None,
                     destination: int | None = None) -> list[int]:
    count = struct.unpack_from('<H', effect, 196)[0]
    if maximum is None:
        maximum = struct.unpack_from('<H', effect, 5758)[0]
    if destination is None:
        destination = struct.unpack_from('<H', effect, 5756)[0]
    if count > 512:
        raise ValueError('committed menu exceeds sparse bank')
    keys = struct.unpack_from('<' + 'H'*count, effect, 198)
    values = struct.unpack_from('<' + 'H'*count, effect, 1222)
    text = []
    for index in range(maximum + 1):
        key = (destination + index) & 65535
        matches = [value for current, value in zip(keys, values) if current == key]
        if len(matches) != 1:
            raise ValueError('committed text cell missing or ambiguous')
        value = matches[0]
        if value == 0:
            break
        if not 32 <= value <= 126 or 97 <= value <= 122:
            raise ValueError('string text is not canonical uppercase DOS ASCII')
        text.append(value)
    else:
        raise ValueError('committed text lacks bounded terminator')
    if not text:
        raise ValueError('native empty input must commit one space')
    return text


def check_menu_edit(old: bytes, committed: bytes) -> None:
    """Only CCMENU INPUT_STRING's update/append of text cells may edit FX."""
    if len(old) not in (5932,5948) or len(committed) != len(old):
        raise ValueError('menu bank extent differs')
    if struct.unpack_from('<H',old,5760)[0] == 0x39:
        check_effect(committed,struct.unpack_from('<H',old,122)[0],pending=False)
        if selection(committed)[0] != 1 and selection(committed)[:2] != selection(old)[:2]:
            raise ValueError('WHO cannot invent null or not-found identity')
        expected = bytearray(old)
        expected[5782:5786] = committed[5782:5786]
        expected[5940:5944] = committed[5940:5944]
        if bytes(expected) != committed: raise ValueError('WHO edit alters state outside selected identity')
        return
    if struct.unpack_from('<H', old, 5760)[0] != 0x10:
        if committed != old:
            raise ValueError('ordinary menu answer edits VM state')
        return
    maximum, destination = struct.unpack_from('<2H', old, 5758)[0], struct.unpack_from('<H', old, 5756)[0]
    text = committed_string(committed, maximum=maximum, destination=destination)
    expected = bytearray(old)
    old_count = struct.unpack_from('<H', old, 196)[0]
    if old_count > 512:
        raise ValueError('old menu exceeds sparse bank')
    old_keys = list(struct.unpack_from('<' + 'H'*old_count, old, 198))
    for index, value in enumerate(text + [0]):
        key = (destination + index) & 65535
        if key in old_keys:
            at = old_keys.index(key)
        else:
            if len(old_keys) == 512:
                raise ValueError('text commit exceeds sparse bank')
            at = len(old_keys)
            old_keys.append(key)
            struct.pack_into('<H', expected, 198+at*2, key)
        struct.pack_into('<H', expected, 1222+at*2, value)
    struct.pack_into('<H', expected, 196, len(old_keys))
    if committed != expected:
        raise ValueError('menu edit differs from exact native text commit')


def validate(record: Continuation) -> None:
    if type(record.paths) is not tuple or type(record.sections) is not tuple:
        raise ValueError('continuation containers must be immutable tuples')
    if record.phase not in tuple(Phase) or not 0 <= record.area <= 65535 or not 1 <= record.count <= 6:
        raise ValueError('invalid continuation profile/state')
    if type(record.interactive) is not bool:
        raise ValueError('invalid menu invocation mode')
    check_context(record.context)
    if type(record.resume_kind) is not int or record.resume_kind not in (0, 1, 2, 3):
        raise ValueError('invalid resume kind')
    if record.resume_kind in (1,2) and record.phase == Phase.PREPARED:
        raise ValueError('advance kind cannot be prepared combat')
    check_paths(record.paths)
    if len(record.sections) != len(SECTION_KEYS):
        raise ValueError('wrong section count')
    if any(type(part) is not bytes for part in record.sections):
        raise ValueError('continuation sections must be immutable snapshots')
    roster = decode_roster(record.part('roster'))
    if len(roster.heroes) != record.count:
        raise ValueError('roster count differs')
    if any(hero.body[437] > hero.body[112] for hero in roster.heroes):
        raise ValueError('prepared roster HP exceeds maximum')
    request = record.part('request')
    if len(request) != 346:
        raise ValueError('invalid request extent')
    initial_origin = request[:8] == struct.pack('<4s2H',b'GBIR',1,4)
    if initial_origin:
        if struct.unpack_from('<H',request,8)[0] not in (1,2) or record.resume_kind == 0:
            raise ValueError('invalid initial cursor origin')
        if record.resume_kind in (1,2) and struct.unpack_from('<H',request,8)[0] != record.resume_kind:
            raise ValueError('cursor kind differs from GBIR bound paused origin')
    elif request[:10] != struct.pack('<4s3H',b'GBHR',2,4,0) or record.resume_kind == 3:
        raise ValueError('invalid physical combat request')
    if record.resume_kind == 3 and record.phase != Phase.PREPARED:
        raise ValueError('initial cursor cannot invent completion')
    paths = dict(zip(PATH_KEYS, record.paths))
    if tuple(read_path(request[10+i*112:122+i*112]).upper() for i in range(3)) != tuple(
            paths[k].upper() for k in ('result', 'roster', 'paused')):
        raise ValueError('request path binding differs')
    paused = record.part('paused')
    check_effect(paused, record.area, pending=record.resume_kind not in (1,3))
    check_actor_binding(paused,roster)
    if record.resume_kind == 3:
        status = struct.unpack_from('<H',paused,8)[0]
        origin = struct.unpack_from('<H',request,8)[0]
        if (origin,status) not in ((1,2),(2,3)) or (status==2 and not record.interactive) or (status==3 and struct.unpack_from('<H',paused,32)[0]):
            raise ValueError('initial cursor is not a genuine menu or empty combat')
    if record.resume_kind == 1:
        if not record.interactive or struct.unpack_from('<H', paused, 4)[0] not in (15,16):
            raise ValueError('menu advance requires supported interactive Secret menu')
    elif record.resume_kind == 2 and struct.unpack_from('<H', paused, 32)[0]:
        raise ValueError('empty combat advance contains a real encounter')
    seed = record.part('seed')
    if len(seed) != 150 or seed[:6] != b'GBPS\1\0':
        raise ValueError('resume is not the proven non-writing seed profile')
    flags = struct.unpack_from('<H', seed, 6)[0]
    if flags & ~7 or not flags & 1 or struct.unpack_from('<H', seed, 8)[0] != record.count:
        raise ValueError('seed count/profile differs')
    if seed[21] or any(seed[14+i] > cap for i, cap in enumerate((8, 8, 4, 8, 8, 16, 4))):
        raise ValueError('seed list extent/reservation differs')
    for count_at, entries_at in ((16, 54), (20, 134)):
        for index in range(seed[count_at]):
            member = struct.unpack_from('<H', seed, entries_at + index * 4)[0]
            if not 1 <= member <= record.count:
                raise ValueError('seed member list names an unowned row')
    identity = record.part('identity')
    if len(identity) < 20 or identity[:8] != struct.pack('<4s2H', b'GBID', 1, 16):
        raise ValueError('invalid source identity')
    size, reserved = struct.unpack_from('<2I', identity, 8)
    if not 16 <= size <= MAX_SOURCE or reserved or len(identity) != size + 16 or identity[16:20] != b'GLIB':
        raise ValueError('source identity extent/profile differs')
    check_source_pc(identity, record.part('paused'), record.area)
    later = ('result', 'outcome', 'successor', 'stream', 'receipt')
    if record.phase == Phase.PREPARED:
        if record.resume_kind == 3:
            check_stream(record.part('stream'),paused)
            later=('result','outcome','successor','receipt')
        if any(record.part(k) for k in later):
            raise ValueError('prepared record contains unacknowledged output')
        return
    result = record.part('result')
    if record.resume_kind == 0:
        projected_roster(record, result)
        if struct.unpack_from('<H', result, 14)[0]:
            raise ValueError('frozen completion must precede consumption')
        outcome = struct.unpack_from('<H', result, 6)[0]
        if record.part('outcome') != (b'party\r\n', b'enemy\r\n', b'draw\r\n', b'flee\r\n')[outcome]:
            raise ValueError('outcome text differs from actual result')
    else:
        if result:
            raise ValueError('menu/empty advance cannot contain HP result')
        if record.resume_kind == 1:
            check_menu_outcome(paused, record.part('outcome'))
        elif record.part('outcome') != b'victory\r\n':
            raise ValueError('empty combat requires native victory outcome')
    if record.phase == Phase.COMPLETED:
        if any(record.part(k) for k in ('successor', 'stream', 'receipt')):
            raise ValueError('completed record contains unacknowledged successor')
        return
    successor = record.part('successor')
    if len(successor) < 124:
        raise ValueError('short successor')
    successor_area = struct.unpack_from('<H', successor, 122)[0]
    check_effect(successor, successor_area, pending=False)
    check_actor_binding(successor,roster)
    check_source_pc(identity, successor, successor_area)
    if struct.unpack_from('<H', successor, 8)[0] == 2 and not record.interactive:
        raise ValueError('menu successor requires interactive invocation')
    check_stream(record.part('stream'), successor)
    receipt = record.part('receipt')
    if len(receipt) < RECEIPT_HEADER.size:
        raise ValueError('successor lacks producer completion receipt')
    magic, version, hlen, inputs_len, effect_len, stream_len, reserved = RECEIPT_HEADER.unpack_from(receipt)
    if (magic, version, hlen, reserved) != (b'GBKO', 1, RECEIPT_HEADER.size, 0):
        raise ValueError('invalid producer completion receipt')
    parts = list(record.sections)
    parts[7:] = [b'', b'', b'']
    completed = replace(record, phase=Phase.COMPLETED, sections=tuple(parts))
    expected_inputs = encode(completed)
    if (inputs_len, effect_len, stream_len) != (len(expected_inputs), len(successor), len(record.part('stream'))):
        raise ValueError('producer receipt extent differs')
    if receipt[RECEIPT_HEADER.size:] != expected_inputs + successor + record.part('stream'):
        raise ValueError('producer receipt does not bind exact inputs/output')


def encode(record: Continuation) -> bytes:
    validate(record)
    header = HEADER.pack(b'GSK3', 3, int(record.phase), 4, 1, record.count,
                         record.area, HEADER.size, int(record.interactive), record.resume_kind, 0, *map(len, record.sections))
    return (header + b''.join(path_bytes(p) for p in record.paths)
            + encode_context(record.context, record.interactive) + b''.join(record.sections))


def decode(data: bytes) -> Continuation:
    if len(data) < BODY_OFFSET:
        raise ValueError('short continuation')
    values = HEADER.unpack_from(data)
    magic, version, phase, title, profile, count, area, hlen, *tail = values
    if (magic, version, title, profile, hlen) != (b'GSK3', 3, 4, 1, HEADER.size) or tail[0] > 1 or tail[1] > 3 or tail[2]:
        raise ValueError('invalid continuation header')
    try:
        phase = Phase(phase)
    except ValueError as exc:
        raise ValueError('future continuation phase') from exc
    sizes = tail[3:]
    if sum(sizes) + BODY_OFFSET != len(data):
        raise ValueError('continuation extent differs')
    cursor = HEADER.size
    paths = tuple(read_path(data[cursor+i*112:cursor+(i+1)*112]) for i in range(len(PATH_KEYS)))
    cursor += PATH_TABLE_BYTES
    context = decode_context(data[cursor:cursor+CONTEXT_BYTES], bool(tail[0]))
    cursor += CONTEXT_BYTES
    parts = []
    for size in sizes:
        parts.append(data[cursor:cursor+size]); cursor += size
    record = Continuation(phase, area, count, paths, tuple(parts), bool(tail[0]), tail[1], context)
    validate(record)
    return record


def bind_result(prepared: Continuation, result: bytes, outcome: bytes) -> Continuation:
    validate(prepared)
    if prepared.phase != Phase.PREPARED:
        raise ValueError('completion already bound')
    parts = list(prepared.sections)
    parts[5:7] = [result, outcome]
    bound = replace(prepared, phase=Phase.COMPLETED, sections=tuple(parts))
    validate(bound)
    return bound


def check_settled(record: Continuation, result: bytes, roster: bytes) -> None:
    validate(record)
    if record.resume_kind:
        if record.phase == Phase.PREPARED or result or roster != record.part('roster'):
            raise ValueError('advance settlement differs from frozen current roster')
        return
    if record.phase == Phase.PREPARED or len(result) < 16 or result[14:16] != b'\1\0':
        raise ValueError('completion not settled')
    normalized = result[:14] + b'\0\0' + result[16:]
    if normalized != record.part('result') or projected_roster(record, normalized) != roster:
        raise ValueError('settlement differs from frozen completion')


def bind_advance(active: Continuation, *, resume_kind: int, outcome: bytes,
                 roster: bytes, committed_menu: bytes | None = None) -> Continuation:
    """Replace one ACTIVE cursor with bounded COMPLETED menu/empty inputs."""
    validate(active)
    initial = active.phase == Phase.PREPARED and active.resume_kind == 3
    if (active.phase != Phase.ACTIVE and not initial) or resume_kind not in (1, 2):
        raise ValueError('advance requires active cursor and menu/empty kind')
    expected = (projected_roster(active, active.part('result')) if active.resume_kind == 0
                else active.part('roster'))
    if roster != expected:
        raise ValueError('advance roster differs from current settled party')
    paused = active.part('paused') if initial else active.part('successor')
    if committed_menu is not None:
        if resume_kind != 1:
            raise ValueError('only menu advance may provide committed text')
        check_menu_edit(paused, committed_menu)
        paused = committed_menu
    parts = list(active.sections)
    if parts[0][:4] == b'GBIR':
        request = bytearray(parts[0]); struct.pack_into('<H',request,8,resume_kind)
        parts[0] = bytes(request)
    parts[1], parts[2], parts[5], parts[6] = roster, paused, b'', outcome
    parts[7:] = [b'', b'', b'']
    record = replace(active, phase=Phase.COMPLETED, resume_kind=resume_kind,
                     area=struct.unpack_from('<H', paused, 122)[0], sections=tuple(parts))
    validate(record)
    return record


def make_receipt(record: Continuation, successor: bytes, *, wrapper_exit: int, stream: bytes = b'') -> bytes:
    """Wrapper-only publication, after successful close and complete validation.

    The eventual DOS wrapper must mint this record itself; caller-reported
    success, an existing output path, or a checksum is not its substitute.
    """
    validate(record)
    if record.phase != Phase.COMPLETED or wrapper_exit != 0:
        raise ValueError('wrapper did not complete')
    inputs = encode(record)
    receipt = RECEIPT_HEADER.pack(b'GBKO', 1, RECEIPT_HEADER.size,
                                  len(inputs), len(successor), len(stream), 0) + inputs + successor + stream
    parts = list(record.sections)
    parts[7:] = [successor, stream, receipt]
    validate(replace(record, phase=Phase.ACTIVE, sections=tuple(parts)))
    return receipt


def activate(record: Continuation, successor: bytes, *, producer_receipt: bytes,
             settled_result: bytes, settled_roster: bytes, stream: bytes = b'') -> Continuation:
    check_settled(record, settled_result, settled_roster)
    if record.phase != Phase.COMPLETED:
        raise ValueError('wrapper completion is not authorized')
    parts = list(record.sections)
    parts[7] = successor
    parts[8] = stream
    parts[9] = producer_receipt
    active = replace(record, phase=Phase.ACTIVE, sections=tuple(parts))
    validate(active)
    return active
