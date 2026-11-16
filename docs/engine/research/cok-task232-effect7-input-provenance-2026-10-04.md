# CoK Task232 — effect-7 input provenance at the attack callback boundary

**Bounded result: 2026-10-04.** The cache-corrected ordinary START replay was
stopped immediately before the first attack-specific mode-4/index-7 callback
at descriptor-12 `10DF0`. The probe recorded guest/host writes separately and
installed dynamic watches after the context allocation/clear sites. It
establishes the runtime arguments, selected body/context values, immediate
guest writers, and retail allocator stores for the body context pointer. It
does not prove complete source lineage for the context target or all arguments.

## Probe and replay

- Probe: `tools/probe_cok_task232_effect7_input_provenance.py`, SHA-256
  `D2BE60D96013EA1C1AFA6028B5F642312024ABE232FAF4FFDF6DC5600D0CC209`.
- Trace: `C:\\temp\\goldbox_task232_effect7_input_provenance.txt`, SHA-256
  `426322BA7ADD0F820D8683E72D060E3C5F68BA5935593CFFDF6DC5600D0CC209`
  (4,709,521 bytes).
- Retail input hashes are those recorded in Task231. Natural START/VROOMM
  replay; no overlay preload, call-site patch, or synthetic keys. The probe
  stopped at 69,566,081 before executing callback `417F:0208`; blocked=0, no
  BIOS block, and no key exhaustion.
- The selected chain is the attack-specific `14F24` at 69,565,822, descriptor-23
  mode-4 dispatcher at 69,565,933, index-7 wrapper at 69,566,063, then the
  callback boundary. The earlier mode-0A callback is excluded.

## Runtime values and writes

At `14F24`, the raw frame is
`9018a34701000000016c0000fd62000002013a000001ed2d`: word argument `1`,
far pointers `6C01:0000` and `62FD:0000`. These point at bytes beginning
`BOZAK...` and `LYN SWIFTFOOT...`. At the mode-4 dispatcher the owner handle
pointer is `2491:3D2C`; its four bytes are `0000fd62`, resolving to
`62FD:0000`. The wrapper receives index word `6007` (low byte 7), auxiliary
pointer `60AA:0008`, and that same handle pointer. The callback frame supplies
mode word `6000`, auxiliary pointer `60AA:0008`, and owner handle pointer
`2491:3D2C`.

The selected body has `+0x189 = 01`. Its `+0x183` bytes are `08 00 8B 61`,
which decode to `618B:0008`. Per-byte writer records show the pointer was
written directly: descriptor-10 runtime `33A8:1115` wrote the offset bytes
at instruction 54,669,678, and `33A8:111A` wrote the segment bytes at
54,669,679. Descriptor-10 OVR base `E19A` maps these to file offsets
`F2AF` and `F2B4`, respectively, matching the allocator pointer stores.
This ties the `F273`-allocated context to the selected body. The context reads
`000101060101180001070000016c0000000100000003`. A dynamic watch began at
the matching `F273` context clear (instruction 54,669,682) and recorded a
guest writer for every one of these 22 bytes. `DS:713C` is zero; the replay
recorded its last guest write at `417F:388E`. `DS:6BB0..6BB3` is
`43 00 65 10`, written at `2CBE:3927/392A`; `DS:6D74..6D77` is
`28 02 65 10`, written at `2CBE:3E96/3E99`, which map through
descriptor-12 base `10BE8` to OVR `14A7E/14A81` (live stores
`A3 74 6D` / `89 16 76 6D`). The probe captured latest
writers for the argument objects, auxiliary object, stack arguments, and the
context, distinguishing guest from host writes.

## Remaining provenance boundary

The observed body context pointer and all 22 context bytes have matching
immediate guest writers; the pointer-store sites map to the retail allocator
path. The context target pointer at `+0x0A/+0x0C` was written by descriptor-13
runtime `47A3:1B51/1B55`, mapping to retail OVR offsets `168BB/168BF`. Their
source operands are descriptor-13 `167AF` frame `[BP+0x10]/[BP+0x12]`; the
destination body is passed at `[BP+0x14]/[BP+0x16]`. Tracing those operands
back through allocation/copy is the remaining provenance boundary. Argument
and auxiliary snapshots have guest writer records, but their complete source
lineage and exact retail mapping for some writers remain open. No callback
output, trusted damage, RNG behavior, or consumer semantics are inferred.
