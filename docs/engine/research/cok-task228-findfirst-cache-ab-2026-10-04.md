# Task 228: translation-cache A/B at the first call

**Status: CLOSED BOUNDED — 2026-10-04.**

Replay inputs were START.EXE SHA-256 `E51D88ECEF07CFFE4A14036DE3DBDC6CE7E7FF0DB7482F3771D6F99EB7BBB956` and GAME.OVR SHA-256 `C3F448C391EA860F97DEC99CE88B0B8B0A4A7E807CF3B1F5A8F1515E2A7A0529`. Probe `tools/probe_cok_task228_findfirst_cache_ab.py` SHA-256 `347ABA2430C93410E7B584038EA3D58590DC6D25335D0E4953812003A580E6E8`; trace `C:\temp\goldbox_task228_findfirst_call_window.txt` SHA-256 `1B2E36E0DA058535FA5DF9D4D76C12EBE2766A2CC3C3DDA3F2DDD38A4F598F59`.

Immediately before the first caller instruction `3DE4:091D`, the probe hashed physical runtime code range `28910..2AB0A` as `10F9ED41C2E054427A0320260C0E76F91472D8DD525FD45D39754FB02BB13ECB`, called Unicorn 2.1.4 `ctl_remove_cache` on that range, rewrote IP to `091D` once, and confirmed the full memory hash and captured sites were unchanged.

With the one-shot cache intervention, execution followed live code from `2891:00C5` to `0153`, reached the retail `RETF 2` bytes `CA 02 00` at `0165` (instruction 77,574,237), and returned to `3DE4:0922` with `SP=3DD6`. Before the later pointer call, SP remained `3DD6`; descriptor-28 entry `4705:00E4` received `2491:3DD7`, the intact local Pascal `PIC` object. The malformed `4950:03D7` pointer was not produced on this path.

This confirms a translation-cache problem in the modeled replay: code-cache refresh plus a PC rewrite restores the live control flow and stack behavior without changing guest memory. It does not isolate whether cache invalidation or the PC rewrite is the necessary part, nor identify the earlier write/reload that left stale translated code. The path diverged before the prior malformed FindFirst boundary and the run stopped at the 80,000,000-instruction cap; downstream progress is not verified. Task 229 traces host-side and guest writes overlapping the runtime code range and the earlier execution around the affected bytes.
