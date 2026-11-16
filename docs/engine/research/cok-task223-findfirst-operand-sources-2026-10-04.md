# Task 223: Pascal operands that assemble the malformed path

**Status: CLOSED BOUNDED — 2026-10-04.**

Replay inputs were START.EXE SHA-256 `E51D88ECEF07CFFE4A14036DE3DBDC6CE7E7FF0DB7482F3771D6F99EB7BBB956` and GAME.OVR SHA-256 `C3F448C391EA860F97DEC99CE88B0B8B0A4A7E807CF3B1F5A8F1515E2A7A0529`. Probe `tools/probe_cok_task223_findfirst_operand_sources.py` SHA-256 `FCB790EA3B4B25BABCA5DFAFE2E7C8D72F1F8C13DA2DBB89B166C58C44B6FC83`; trace `C:\temp\goldbox_task223_findfirst_operand_sources.txt` SHA-256 `298A0D87044995063B250606A31269A180C29E90C9D9005C69897DB572AB06D6`.

At `169C:088E`, the runtime objects are left Pascal length 9 at `2491:3CA5` and right length 4 at `2491:3CA0`. The left payload is `76 FC FF 76 FA B0 00 50 32`; right is `.dax`. Capacity-`0050` copies return at `169C:08A8` and `169C:08BC`; the first positive-CX bodies copy 9 and 4 bytes into `3C37` and `3BE6`.

Sol's static/runtime cross-check identifies the left construction: the malformed eight-byte literal is Pascal object `2491:3DBF` / payload `3DC0..3DC7`; a final digit `2` is object `2491:3DB0` / payload `3DB1`. `0B64` adds the digit to the existing length byte, making length 9. The `.dax` object is the retail literal at GAME.OVR file offset `0x3CA56`, descriptor 28. At runtime it is copied from `4705:00D1`.

The same replay stopped at the first malformed post-COMBAT FindFirst service, instruction 77,588,222, with no keys, blocking, or termination. The source objects' incoming constructor argument is the next trace target; this capture establishes runtime writers, not intended input correctness.
