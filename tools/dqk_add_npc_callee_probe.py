#!/usr/bin/env python3
"""Unicorn probe of DQK's ADD_NPC callee (canonical 2177:2886, DQK.EXE 0x359E6).

The callee lives in the overlay whose canonical segment 0x2177 starts at file
0x33160 (0x362FD - 0x319D, the anchor docs/engine/research/decompile-dqk-ecl-
dispatch.md uses for 2177:319D).  The gate (2177:2886) and the list insert
(2177:3491) run as retail bytes; the allocator, the MONCHA record loader
(2177:257C), memset, the join message and the NPC-flag UI helper are stubs that
record the call.  See docs/engine/research/dqk-add-npc-full-party.md.
"""
from __future__ import annotations
import struct
from pathlib import Path

EXE = Path(__file__).resolve().parent.parent / 'The Dark Queen of Krynn' / 'DQK.EXE'
OVL_FILE, OVL_SEG, OVL_LEN = 0x33160, 0x2177, 0x3800
CMP_IMM_FILE = 0x359F0 + 4      # imm8 of  cmp byte es:[bx+0x20],7
JA_FILE = 0x359F5               # ja skip
DS, SS, STK, GAME, RECSEG0 = 0x6000, 0x9000, 0xF000, 0x6800, 0x7000
G_PTR, HEAD_PTR = 0xB20F, 0xC6E5
REC = 0x19E + 0x40


def lin(seg, off):
    return seg * 16 + off


def run(count, slots, *, id_=115, patch_imm=None, nop_ja=False, exe=None):
    from unicorn import Uc, UC_ARCH_X86, UC_MODE_16, UC_HOOK_CODE
    from unicorn.x86_const import (UC_X86_REG_CS, UC_X86_REG_DS, UC_X86_REG_ES, UC_X86_REG_SS,
                                   UC_X86_REG_SP, UC_X86_REG_IP, UC_X86_REG_BP)
    data = bytearray(exe if exe is not None else EXE.read_bytes())
    if patch_imm is not None:
        data[CMP_IMM_FILE] = patch_imm
    if nop_ja:
        data[JA_FILE:JA_FILE + 2] = b'\x90\x90'
    uc = Uc(UC_ARCH_X86, UC_MODE_16)
    uc.mem_map(0, 0x110000)
    uc.mem_write(lin(OVL_SEG, 0), bytes(data[OVL_FILE:OVL_FILE + OVL_LEN]))

    def w(a, b):
        uc.mem_write(a, b)

    def r16(a):
        return struct.unpack('<H', bytes(uc.mem_read(a, 2)))[0]

    w(lin(DS, G_PTR), struct.pack('<HH', 0, GAME))
    w(lin(GAME, 0x20), bytes([count]))           # party count byte
    recs = []
    for i, s in enumerate(slots):
        seg = RECSEG0 + i * 0x40
        recs.append(seg)
        w(lin(seg, 0xC5), bytes([s]))            # party slot index
    for i, seg in enumerate(recs):
        nxt = (0, recs[i + 1]) if i + 1 < len(recs) else (0, 0)
        w(lin(seg, 0), struct.pack('<HH', *nxt))
    head = (0, recs[0]) if recs else (0, 0)
    w(lin(DS, HEAD_PTR), struct.pack('<HH', *head))
    newseg = RECSEG0 + 0x400
    calls = []
    DONE = 0x0050

    def retf(uc_, sp, base, pop):
        uc_.reg_write(UC_X86_REG_SP, sp + 4 + pop)
        uc_.reg_write(UC_X86_REG_IP, r16(base))
        uc_.reg_write(UC_X86_REG_CS, r16(base + 2))

    def hook(uc_, addr, size, _):
        sp = uc_.reg_read(UC_X86_REG_SP)
        base = lin(SS, sp)
        if addr == lin(0xDF9, 0x2FC):            # far alloc into *(dest)
            w(lin(r16(base + 6), r16(base + 4)), struct.pack('<HH', 0, newseg))
            calls.append('alloc')
            retf(uc_, sp, base, 0)
        elif addr == lin(OVL_SEG, 0x257C):       # near: load MONCHA record into [bp+0xa]
            rseg = r16(base + 8)
            w(lin(rseg, 0), bytes(REC))
            w(lin(rseg, 0x9B), b'\x32')
            w(lin(rseg, 0xC5), b'\xff')
            calls.append('loadrec')
            uc_.reg_write(UC_X86_REG_SP, sp + 2)
            uc_.reg_write(UC_X86_REG_IP, r16(base))
        elif addr == lin(0xD7, 0x27A6):          # memset(dest far, n, val)
            doff, dseg, n, v = r16(base + 4), r16(base + 6), r16(base + 8), r16(base + 10)
            w(lin(dseg, doff), bytes([v & 255]) * n)
            retf(uc_, sp, base, 0)
        elif addr == lin(0x104C, 0xDF):
            calls.append('msg')
            retf(uc_, sp, base, 0)
        elif addr == lin(0x1D99, 0x13AF):
            calls.append('npcflag')
            retf(uc_, sp, base, 0)
        elif addr == lin(DONE, 0):
            uc_.emu_stop()

    for a in (lin(0xDF9, 0x2FC), lin(OVL_SEG, 0x257C), lin(0xD7, 0x27A6), lin(0x104C, 0xDF),
              lin(0x1D99, 0x13AF), lin(DONE, 0)):
        uc.hook_add(UC_HOOK_CODE, hook, None, a, a)
    sp = STK - 6
    w(lin(SS, sp), struct.pack('<HHH', 0, DONE, id_))
    for reg, v in ((UC_X86_REG_SS, SS), (UC_X86_REG_DS, DS), (UC_X86_REG_ES, DS), (UC_X86_REG_SP, sp),
                   (UC_X86_REG_CS, OVL_SEG), (UC_X86_REG_IP, 0x2886), (UC_X86_REG_BP, 0)):
        uc.reg_write(reg, v)
    uc.emu_start(lin(OVL_SEG, 0x2886), lin(DONE, 0), count=20000)
    walk = []
    p = struct.unpack('<HH', bytes(uc.mem_read(lin(DS, HEAD_PTR), 4)))
    while (p[0] or p[1]) and len(walk) < 16:
        walk.append((p[1], bytes(uc.mem_read(lin(p[1], 0xC5), 1))[0]))
        p = struct.unpack('<HH', bytes(uc.mem_read(lin(p[1], 0), 4)))
    new = bytes(uc.mem_read(lin(newseg, 0), REC))
    return {'count': bytes(uc.mem_read(lin(GAME, 0x20), 1))[0], 'slots': [s for _, s in walk],
            'calls': calls, 'flag9b': new[0x9B], 'id_bd': new[0xBD],
            'inserted': any(a == newseg for a, _ in walk)}


if __name__ == '__main__':
    cases = (('count 6', dict(count=6, slots=list(range(6)))),
             ('count 7', dict(count=7, slots=list(range(7)))),
             ('count 8 (full)', dict(count=8, slots=list(range(8)))),
             ('count 255', dict(count=255, slots=list(range(8)))),
             ('holes {0,1,3}', dict(count=3, slots=[0, 1, 3])),
             ('empty', dict(count=0, slots=[])),
             ('MUT imm 7->6, count 7', dict(count=7, slots=list(range(7)), patch_imm=6)),
             ('MUT ja nopped, count 8', dict(count=8, slots=list(range(8)), nop_ja=True)))
    for label, kw in cases:
        print(label, run(**kw))
