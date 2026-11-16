# Task 224: incoming malformed prefix source

**Status: CLOSED BOUNDED — 2026-10-04.**

Replay inputs were START.EXE SHA-256 `E51D88ECEF07CFFE4A14036DE3DBDC6CE7E7FF0DB7482F3771D6F99EB7BBB956` and GAME.OVR SHA-256 `C3F448C391EA860F97DEC99CE88B0B8B0A4A7E807CF3B1F5A8F1515E2A7A0529`. Probe `tools/probe_cok_task224_findfirst_prefix_source.py` SHA-256 `4409E798F7998DCCE696DC55210AC15C7D685B29B035EC17A7214F68ABC4A48C`; trace `C:\temp\goldbox_task224_findfirst_operand_sources.txt` SHA-256 `DABBCC45DFC2F04BDBF0F67566CCFEDB35DDF0420F03C6B479827FC4412886D6`.

The descriptor-28 procedure entry `4705:00E4` runs at instruction 77,574,317 with `SS:SP=2491:3DCA`. Its incoming pointer at stack `+0C/+0E` is `4950:03D7`, with captured bytes `FF 76 FC FF 76 FA B0 00 50`. The first byte is interpreted as Pascal length 255 and clamped to capacity 8. The call returns at `4705:00FE`; at instruction 77,574,353 the helper has copied a length-8 object with payload `76 FC FF 76 FA B0 00 50` into `2491:3DBF`. This is the exact prefix later extended with digit `2` and appended with `.dax`.

The incoming source is not a valid string buffer: `4950:03D7` aliases `489D:0F07` at physical address `0x498D7`. Its 24 bytes exactly match executable bytes in GAME.OVR descriptor 23 at file offset `0x34EB2`, beginning `PUSH [BP-4]; PUSH [BP-6]; MOV AL,0; PUSH AX`. The descriptor-28 procedure therefore reads code bytes as a Pascal string. Static descriptor 28 (file base `0x3C985`) matches the later constructors: capacity-8 `0ADE` returns at `00FE`; `0AC4` returns at `01D0`, assigning `3DBF` to `3CA5`; `0B51` returns at `01DA`, appending object `3DB0` to `3CA5`; and `0AC4` returns at `01EA`, copying `.dax` from `4705:00D1` to `3CA0`. The `.dax` bytes match the retail literal at GAME.OVR file offset `0x3CA56`.

The replay stopped at the first malformed post-COMBAT FindFirst service, instruction 77,588,222, with no keys, blocking, or termination. This attributes the malformed source bytes and confirms their code overlay provenance, but does not explain why the caller supplied that pointer. Task 225 traces the far-pointer handoff from the caller's intended local `PIC` string.
