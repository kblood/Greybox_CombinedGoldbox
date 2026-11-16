# Task 226: locate the caller stack drift

**Status: CLOSED BOUNDED — 2026-10-04.**

Replay inputs were START.EXE SHA-256 `E51D88ECEF07CFFE4A14036DE3DBDC6CE7E7FF0DB7482F3771D6F99EB7BBB956` and GAME.OVR SHA-256 `C3F448C391EA860F97DEC99CE88B0B8B0A4A7E807CF3B1F5A8F1515E2A7A0529`. Probe `tools/probe_cok_task226_findfirst_stack_drift.py` SHA-256 `14578DD37A0860A39C56271157BAC47C8157C3C78FEDF4242B94B9698978B325`; trace `C:\temp\goldbox_task226_findfirst_pointer_handoff.txt` SHA-256 `D30C76507B7B0D4D97780A41927F986764ED71A78A3F4A28201A203FA7D33066`.

At caller `3DE4:0914`, `SP=3DDE`, `BP=3DE2`; after `PUSH BP` and frame setup at `0917`, the six-byte local allocation has completed by `091A` with `BP=3DDC`, `SP=3DD6`. The first call is at `091D`, entered at public stub `104E:002A` then descriptor-7 runtime procedure `2891:0032`. The caller return boundary `0922` observes `SP=3DDA`: four bytes above the reserved-local boundary. The second call at `0925` is a control: stub `104E:0025`, procedure `2891:0168`, runtime `RETF 2` at `01E5` with `SP=3DD4`, and return `092A` at `SP=3DDA`. The same high SP remains at `097F` before the pointer construction.

This bounded result attributes the first observed drift to the first call/return window, not to the local allocation itself. The probe did not capture every instruction within the first callee; it did not observe the static candidate `RETF 2` at `0165`, so this evidence does not identify the instruction that changes SP. Task 227 captures the 62-instruction first-call window with per-instruction registers, bytes, stack, and modeled SP/BP writes.

The replay stopped at the same first malformed post-COMBAT FindFirst boundary, instruction 77,588,222, with no keys, blocking, or termination.
