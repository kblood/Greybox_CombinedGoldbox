# CoK Task 237: owner of the DS:609A list (correcting Task 236)

Tools: `tools/probe_cok_task237_list_owner.py` (static + trace checks; `--replay` regenerates
`C:\temp\goldbox_task237_list_owner.txt`, about 20 min, Unicorn, no host input),
`tools/test_cok_task237_list_owner.py` (static 40+13 mutations, trace 13 checks + 6 mutations + filter and
instrument-removal controls). Both test files plus Task 236's: 51 passed.

## Correction to Task 236

- Task 236's module base 0x1AA73 came from an ambiguous 7-byte match (6 sites). It is wrong: at that base
  36AA:19AE is `a1 96 60`, not the replayed `eb 44`. The only site matching the replay's instruction bytes
  (continuation `eb44a19a60`, file 0x1F082) puts runtime segment 36AA at **overlay 17, GAME.OVR base 0x1D6DB**
  (stub segment 0x9E). Segment 36AA is shared by other overlays: of 192 hook hits at the watched IPs only
  **15** execute overlay-17 code (matched by the logged code bytes).
- The routine at 36AA:1989 is an **append** routine, not an unlink routine. The frame [bp+2]=1942 is the
  instruction after `push cs; call 1989` at 193F inside routine 18FC (no mid-instruction landing).
- The executed `mov [609A],ax` at 19A7/19AA (instr 27666561/2, new=6109:0000) is the empty-list head
  initialisation of that append.

## Answers

1. Caller of 1989: near callers at 193F (in 18FC) and 1F99 (inside routine 1B34, never hit in the replay);
   far callers in overlay 18 at ip 38DD and 3A0F. Executed: 18FC only, 3 times.
2. Caller of 18FC: only one far caller statically (overlay 2 ip 3139, file 0x3AA5, runtime 3EE3:3139, return
   3EE3:313E). Executed 3 times (instr 27639478, 27897330, 28161808, byte args 3C,3E,3D). 18FC does
   GetMem(409) at 1910, 161B at 192A, then 1989. Appends at instr 27666551, 27927581, 28188851; 19EF tail
   links at 27927601 (node1->2) and 28188881 (node2->3). Nodes 6109:0000, 6298:0000, 62FD:0000.
3. Chain nodes 4..15 (66AA:0008 ... 716D:0008): linked by **overlay 2 routine 0465** (runtime 3EE3), which
   has its own 409-byte allocation at 066D (reached 9 times in 3 calls of 0465 at instr 51003080, 51403852,
   51630420) and stores the +0x17F/+0x181 link at 061F and 068A. Every link 1..14 is set by exactly one
   nonzero high-word store (nodes 1-2 at 36AA:19EF, nodes 3-14 at 3EE3:061F/068A) and the stored segments
   reproduce the full 15-node chain. Node 15's link is only ever zeroed (including the effect-7 routine loop
   exit 33A8:1C37/1C3C at instr 54873627/8). This list is not built through 1989 beyond node 3.
4. The six non-executed `mov [609A],ax` sites: one second reset (overlay 11 ip 09AE, routine 0843), four
   reorder stores (overlay 16 routines 1CEA and 1E42, two sites each), one removal (overlay 18 ip 3C04,
   routine 3B0A). The two executed sites are the overlay 11 0571 reset and the 1989 append. Static scan: 8
   routines store the +0x17F link; 6 sites allocate 409-byte nodes.

## Unresolved

- Roles of other writers of the current-node cell DS:6096/6098 seen in the replay (runtime 3EE3:08CB,
  3242:0479, 46E0:1BEE/1D67, 47A3:1BEE/1D67), not mapped to overlay routines.
- Semantic role of the list (combatants vs roster) is inferred, not proven.
- Why the effect-7 routine took its 19EF-side branch (carried from Task 236).
- Whether the six unexecuted store sites run after the replay stop point.
- Whether overlay 2 routine 0465's caller context is the party-load path (not traced further).
