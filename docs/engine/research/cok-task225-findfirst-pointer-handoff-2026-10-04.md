# Task 225: caller-to-prefix far-pointer handoff

**Status: CLOSED BOUNDED — 2026-10-04.**

Replay inputs were START.EXE SHA-256 `E51D88ECEF07CFFE4A14036DE3DBDC6CE7E7FF0DB7482F3771D6F99EB7BBB956` and GAME.OVR SHA-256 `C3F448C391EA860F97DEC99CE88B0B8B0A4A7E807CF3B1F5A8F1515E2A7A0529`. Probe `tools/probe_cok_task225_findfirst_pointer_handoff.py` SHA-256 `D6B4E95B3B90ED27AD00F224496CFB02803A0F24E1E6237C4BC6884003A78174`; trace `C:\temp\goldbox_task225_findfirst_pointer_handoff.txt` SHA-256 `E04BAD3B3578410D590C238DC7D6FFC0240336D79DA1AC8C2E66A24F8598447A`.

At caller `3DE4:097F`, `BP=3DDC`, so its local Pascal string starts at `SS:BP-5 = 2491:3DD7`. The code at `097F` calls the copy helper with source literal `CS:0910` and that destination. Guest writes show helper body `1A46:0AD2` writing length `03` to `3DD7` at instruction 77,574,299, then `1A46:0AD7` writing `P` and `I` (`50 49`) to `3DD8..3DD9` at 77,574,302..303; the local object is `03 50 49 43` (`PIC`).

The caller's retained destination far-pointer slot starts at `SS:3DD6`, immediately overlapping the local string at `3DD7`. Before the copy, caller instructions `3DE4:0982..0983` place destination segment `2491` and offset `3DD7` in that slot (instructions 77,574,287..288). The subsequent three Pascal bytes overwrite the high three bytes of that far pointer. At the helper return `3DE4:098E`, `SS:SP=2491:3DD6` contains `D7 03 50 49`: the pointer is now `4950:03D7`.

At the caller's far call `3DE4:099A`, the same bytes at `SS:SP+8` are passed to public stub `1105:002A`, then descriptor-28 procedure `4705:00E4`; both entries retain the identical `4950:03D7` argument. This establishes the first bad boundary: the pointer becomes invalid when the local `PIC` copy overlaps the retained destination pointer. Task 224 showed that `4950:03D7` aliases descriptor-23 code, Task 226 traces the earlier stack drift: caller BP is 3DDC, its six-byte local allocation should leave SP=3DD6, but SP=3DDA before this pointer construction. It will capture the preceding calls and RETF 2 transitions without compensating SP or changing the pointer.

The replay stopped at the first malformed post-COMBAT FindFirst service, instruction 77,588,222, with no keys, blocking, or termination. This is runtime provenance in the modeled replay; it does not establish whether retail input should pass through this malformed native route.
