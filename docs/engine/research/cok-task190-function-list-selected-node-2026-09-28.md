# CoK Task 190 — function-list selected-node producer

**Status: CLOSED BOUNDED, 2026-09-28.** Static retail `GAME.OVR` bytes only;
no new runtime input or DOSBox session. This resolves the source path that
produces the held function-list command and why the captured invocation has no
safe key-only transition to Begin Adventuring. It does not select or dispatch
row 8.

## List construction and returned command

`python tools/disasm_cok.py dis 0x203e2 0x280` confirms that
`GAME.OVR:0x203E2` scans table slots 1 through 12 (zero-based slots 0 through
12). For each enabled flag at `DS:0x8A1 + slot*0x2A`, it copies 0x28 bytes
from `DS:0x878 + slot*0x2A` into an allocated linked-list node. The next
far-link is read and written at node offsets `+0x2A/+0x2C`. The scan preserves
table order, which matches the held capture's enabled rows 1–9.

At `0x2056D`, the caller invokes descriptor `FD:0x34` with the list and
selector arguments. On return it loads the selector's far-pointer output from
`SS:[BP-0x19]` and `0x20578` reads `ES:[DI+1]` as the command byte. The caller
copies this byte into its local dispatch value and compares it immediately;
`C` reaches Create and `B` reaches the Begin Adventuring branch. There is no
intervening caller-controlled point that records a changed selection while
withholding dispatch. Source/task-124 joining maps row 1 to table slot 0 / `C`
and row 8 to slot 10 / `B`.

The linked-node selector at `0x3AE4E` walks the far links until its zero-based
ordinal matches the requested index and returns that node, or a null pointer
when it reaches the end. In the held invocation, source and capture join the
one-based `DS:0x6E0F` value to ordinal `DS:0x6E0F - 1`; the captured value 1
therefore returns the first enabled node. The selected-node pointer itself
was not captured at runtime.

## Input producer and boundary

The called selector's source shows two kinds of input update:

- Its K/M row-update block at `0x3B41B` is guarded by parsed candidate count
  `[BP-0x92] > 1`. The other `4`/`6` previous/next candidate updates at
  `0x3B8F1` and `0x3B940` have the same count guard. Task 132's retained
  invocation has count 1 and key-specification text `Select 1!`; K/M are not
  accepted candidate keys. These paths cannot raise the held row from 1 to 8.
- The typed-key parser normalizes and validates a key, searches the parsed
  candidate text, and maps a match back to a candidate ordinal before storing
  `DS:0x6E0F` at `0x3B9FC`. This one-candidate parser state is distinct from
  the nine enabled function-list rows.

The source also has a pointer/hit-testing path: coordinate-derived candidate
selection is written at `0x3B7E4`; the common result path reads the selected
value at `0x3B8C9`. That path returns an option value through the same caller
which immediately reads and dispatches the node command at `0x20578`. It is
not a safe way to capture row 8 without entering the command. Exact mouse
coordinates and a runtime hit are not part of this source-only result.

## Result

No source-backed key-only, non-dispatching row-8 transition was found for the
held invocation. The known one-candidate keyboard routes cannot select row 8;
the mouse/hit result path is coupled to the caller's command dispatch. Keep
Task 125 gated: do not send a route key, use mouse input, or infer campaign
selection from this mapping. The configured no-key demo result is separately
recorded in Task 189. Task 190 closes at this source boundary.
