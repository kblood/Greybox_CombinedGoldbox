# Private ENTRY kind-1 CAPTURE diagnostic

This is a standalone, private DOS diagnostic assembled from the current
`native/src/ccnext.asm` plus
[`secretreward_entry_capture.inc`](secretreward_entry_capture.inc). It does not
change production sources, the checked CCNEXT binary, public dispatch, release
lists, or website behavior. The only new invocation is
`EBCAPT.COM BOOT.DSC C:\TOOLS REPLY.BIN`: phase0 owner descriptor, explicit
directory containing `CCPARTY.COM`, `CCFLOW.COM`, and `CCECL.COM`, and a
disjoint response path.

The diagnostic admits the current ENTRY owner and live P1/source, checks the
GRC namespace and physical frozen ranges, verifies the tool paths, and rejects
path aliases before mutation. It closes the outer owner view and opens GRC
afresh, then checks its whole header and frozen ranges against the admitted
owner and compares its live P1 and source sections. Only then does it call the
existing `kn_capture_producer`, which re-admits the standalone input, current
P1, workspace, and any existing whole CAPTURE receipt before writing. It
creates one private kind-1 `CAPTURE.GSK`; it does not promote the owner or
invoke action2/action3, publication, READY, XP, UI, or any public reward route.

The private COM measures 64,751 raw / 65,007 resident bytes, including a
256-byte PSP and the final 512-byte stack, with a 65,280-byte resident ceiling
and 273 bytes of builder headroom (529 bytes to the physical limit). Its
SHA-256 is
`1fad5187a7380bf0d10f458c74eb875876831dd8f2d83ca9c51b3dd0e1a18f94`. The
capacity script verifies the unchanged public CCNEXT hash and assembles this
diagnostic without executing it. It measures 943 bytes of new code, 14 bytes
of new data, and reuses the existing 1,120-byte path overlay, 48-byte range
specification area, and 64-byte header buffer.

The focused emulator tests compare genuine output byte-for-byte with the
150,631-byte kind-1 GRC producer oracle. They check the paused Treasure27
state, area16/PC605, flags13, empty action queue, roster, seed, complete GRC
receipt, input preservation, and exact cold reuse with no child or write. The
refusal/fault tests cover partial, wrong-kind, foreign-party and altered
receipts; foreign live/input state; missing tools; path aliases; child
failures; disk cuts; retained handles and CWD-restore ownership; warm re-entry;
and a valid foreign party introduced after the owner view closes but before
the fresh standalone GRC reopen. That last change is rejected before child
launch or workspace mutation.

The runtime export is opt-in and uses disposable C/D fixtures. Its manifest
binds the candidate and tools by hash and specifies genuine, cold-exact,
valid-foreign-party, and conflicting-capture cases. The genuine case permits
the producer's pre-existing `PARTY.GKW` workspace scratch files in addition to
the exact CAPTURE receipt. Cold exact reuse must add no file and launch no
child; the refusal cases must preserve all files. See the generated
`manifest.json` and Luna's GameLink evidence for the executed runtime results.

This boundary is not a concurrency protocol: a host writer changing GRC after
the fresh reopen/admission and before the existing helper begins is outside the
verified guarantee. The test injects its late mutation before the fresh reopen,
where the whole-header, frozen-range, live-P1, and source checks reject it.
These results establish a private DOS diagnostic only, not original-game
source reconstruction, a public game feature, a public transaction route, or
publication/recovery authority.
