# Task 227: first-call execution versus live code bytes

**Status: CLOSED BOUNDED — 2026-10-04.**

Replay inputs were START.EXE SHA-256 `E51D88ECEF07CFFE4A14036DE3DBDC6CE7E7FF0DB7482F3771D6F99EB7BBB956` and GAME.OVR SHA-256 `C3F448C391EA860F97DEC99CE88B0B8B0A4A7E807CF3B1F5A8F1515E2A7A0529`. Probe `tools/probe_cok_task227_findfirst_call_window.py` SHA-256 `DAA2F59CE21E58EBC97ABDC485D9C4950C7F6A6F1A2BA99B8067ACABE3353D3D`; trace `C:\temp\goldbox_task227_findfirst_call_window.txt` SHA-256 `E230E56A1FAB86C3683636DB825F7EE445F6005BF38284D71C5E85DECFB6B18D`.

The first call from `3DE4:091D` enters descriptor-7 procedure `2891:0032` with `SP=3DD0`. The focused trace records each hook's linear address and bytes alongside `CS:IP` and segment bytes; the addresses and byte windows match. However, the observed sequence is inconsistent with those bytes: callback `2891:00C5` sees `E9 8B 00` (a near jump to `0153`), while the next callbacks are at `00C7`, `00C9`, and `00CD`. Around the return, execution-state changes resemble `MOV SP,BP; POP BP; RETF 6` although live memory at the corresponding offsets contains different instructions. The caller then sees `SP=3DDA`, four bytes above the correctly reserved `3DD6` boundary. The ordinary second-call path reaches `RETF 2` and serves as a control.

This bounded trace establishes that execution and live code bytes disagree during the first call. Stale translated code is the leading explanation, not yet confirmed. Task 228 adds one probe-only translation-cache invalidation at the first call and verifies that guest memory remains byte-identical; it will compare the resulting control flow and pointer.

The replay stopped at the first malformed post-COMBAT FindFirst service, instruction 77,588,222, with no keys, blocking, or termination.
