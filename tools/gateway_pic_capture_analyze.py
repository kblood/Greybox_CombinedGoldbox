# -*- coding: utf-8 -*-
#!/usr/bin/env python3
"""gateway_pic_capture_analyze.py - offline analysis helpers for the live
DOSBox-X PIC-loader capture (tools/trace_gateway_pic_loader_capture.ps1).

Operates on full conventional-memory dumps (MEMDUMPBIN 0000:0000 A0000)
taken while the guest is genuinely stopped, per the working technique in
tools/cok-m4-memory-signature-route.ps1. Two modes:

  scan <dump.bin> <game.ovr>
      Find every live copy of the Part 13 strict PIC-loader signature:
      entry prefix 55 89 E5 B8 B8 00 9A at rel+0 (the 4 far-call bytes at
      rel+7..+0xA are relocation-patched at load time and are wildcarded),
      81 EC B8 00 at rel+0x0B, and 89 EC 5D CA 0C 00 at rel+0x49E. For each
      match, report whether the far-call bytes differ from the raw
      GAME.OVR placeholder (df 04 43 03) -- differing means the overlay
      manager has PATCHED this copy, i.e. it is the resident, executable
      instance rather than a stale file-cache image.

  extract <dump.bin> <kind:entry|retf> <ss> <sp> <ds> [bufout.bin]
      Decode the loader stack frame from a stopped-state dump.
      entry (stopped at rel+0, before push bp):
        SS:SP -> ret_off, ret_seg, then the six argument words (RETF 0Ch).
        Globals DS:[5D8F] and DS:[5DB6] reported as byte and word.
      retf (stopped at rel+0x4A1, after mov sp,bp; pop bp):
        SS:SP -> ret_off, ret_seg, six argument words (same frame slots);
        the ss:[bp-2A] output-buffer far pointer now sits at SS:SP-2C
        (bp_at_entry == sp_at_retf - 2). Dumps 7744 bytes (0x1E40 --
        Part 7/8's STATICALLY derived length, recorded as such, not a
        runtime-proven size) from the pointed-to buffer to bufout.bin.

All numeric arguments are hex (no 0x prefix needed).
"""
import json
import sys

PIC_LOADER_FILE_OFFSET = 0x4687E
ENTRY_PREFIX = bytes.fromhex("5589e5b8b8009a")
ENTRY_SUFFIX = bytes.fromhex("81ecb800")   # rel+0x0B
RETF_SIG = bytes.fromhex("89ec5dca0c00")   # rel+0x49E
RETF_REL = 0x4A1
BUF_LOCAL_NEG = 0x2A                       # ss:[bp-0x2A] out-buffer far ptr
STATIC_BUF_LEN = 7744                      # 0x1E40, Part 7/8 static derivation


def word(mem, lin):
    return mem[lin] | (mem[lin + 1] << 8)


def scan(dump_path, ovr_path):
    mem = open(dump_path, "rb").read()
    ovr = open(ovr_path, "rb").read()
    raw_farcall = ovr[PIC_LOADER_FILE_OFFSET + 7:PIC_LOADER_FILE_OFFSET + 11]
    out = []
    start = 0
    while True:
        idx = mem.find(ENTRY_PREFIX, start)
        if idx < 0:
            break
        start = idx + 1
        if mem[idx + 0x0B:idx + 0x0F] != ENTRY_SUFFIX:
            continue
        if mem[idx + 0x49E:idx + 0x4A4] != RETF_SIG:
            continue
        live_farcall = mem[idx + 7:idx + 11]
        out.append({
            "linear": idx,
            "linear_hex": "%06X" % idx,
            "entry_seg": "%04X" % (idx >> 4),
            "entry_off": "%X" % (idx & 0xF),
            "retf_linear_hex": "%06X" % (idx + RETF_REL),
            "retf_seg": "%04X" % ((idx + RETF_REL) >> 4),
            "retf_off": "%X" % ((idx + RETF_REL) & 0xF),
            "live_farcall_hex": live_farcall.hex(),
            "raw_farcall_hex": raw_farcall.hex(),
            "relocation_patched": live_farcall != raw_farcall,
        })
    print(json.dumps({"matches": out}, indent=2))


def extract(dump_path, kind, ss_hex, sp_hex, ds_hex, bufout=None):
    mem = open(dump_path, "rb").read()
    ss = int(ss_hex, 16)
    sp = int(sp_hex, 16)
    ds = int(ds_hex, 16)
    stack_lin = ss * 16 + sp
    ret_off = word(mem, stack_lin)
    ret_seg = word(mem, stack_lin + 2)
    args = [word(mem, stack_lin + 4 + 2 * i) for i in range(6)]
    res = {
        "kind": kind,
        "ss": "%04X" % ss, "sp": "%04X" % sp, "ds": "%04X" % ds,
        "ret": "%04X:%04X" % (ret_seg, ret_off),
        "args_hex": ["%04X" % a for a in args],
        "globals": {
            "5D8F_byte": "%02X" % mem[ds * 16 + 0x5D8F],
            "5D8F_word": "%04X" % word(mem, ds * 16 + 0x5D8F),
            "5DB6_byte": "%02X" % mem[ds * 16 + 0x5DB6],
            "5DB6_word": "%04X" % word(mem, ds * 16 + 0x5DB6),
        },
        "stack_raw_hex": mem[stack_lin - 0x30:stack_lin + 0x20].hex(),
    }
    if kind == "retf":
        ptr_lin = stack_lin - (BUF_LOCAL_NEG + 2)   # bp-0x2A == sp-0x2C
        buf_off = word(mem, ptr_lin)
        buf_seg = word(mem, ptr_lin + 2)
        res["buffer_far_ptr"] = "%04X:%04X" % (buf_seg, buf_off)
        buf_lin = buf_seg * 16 + buf_off
        buf = mem[buf_lin:buf_lin + STATIC_BUF_LEN]
        res["buffer_linear_hex"] = "%06X" % buf_lin
        res["buffer_static_len"] = STATIC_BUF_LEN
        res["buffer_nonzero"] = sum(1 for b in buf if b)
        hist = {}
        for b in buf:
            hist[b] = hist.get(b, 0) + 1
        res["buffer_top_bytes"] = sorted(
            (("%02X" % k, v) for k, v in hist.items()),
            key=lambda kv: -kv[1])[:8]
        res["buffer_first64_hex"] = buf[:64].hex()
        if bufout:
            with open(bufout, "wb") as f:
                f.write(buf)
            res["buffer_path"] = bufout
    print(json.dumps(res, indent=2))


def main():
    mode = sys.argv[1]
    if mode == "scan":
        scan(sys.argv[2], sys.argv[3])
    elif mode == "extract":
        extract(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5],
                sys.argv[6], sys.argv[7] if len(sys.argv) > 7 else None)
    else:
        raise SystemExit("unknown mode: %s" % mode)


if __name__ == "__main__":
    main()
