# CoAB `/A 4 /B 34`: true host-effect count (measured 2026-10-07)

Closes the "retail measurement that does not equate the cap to the source effect
count" half of `docs/engine/NATIVE-TASKS-2026-09-12.md` item 25 for this route.

**Result: N = 86 host effects** (direct CCECL retains only the first 64; `gbboot-test.ps1`
pins `GBSX count=0040` as saturated at SCRIPTCAP, which is a ceiling, not a count).

- Source: GBBOOT `/E /X /A 4 /B 34` launches CCFLOW with the tail
  ` ECL4.DAX 34 /E C:\_GBECL.BIN` (no seeds, no roster; captured by running the real
  GBBOOT against a 32-byte stand-in CCFLOW that records its own PSP tail).
- CCFLOW result: `FX_HAVE_SIDECAR` (0100h) set; sidecar is **GBSL v2** (not v1: the
  route has long PRINT/PRINTCLEAR text, so CCFLOW resolves DREFs and appends the packed
  extension). The u16 record count at +6 is the same field in v1 and v2: 86; the fixed
  records occupy `8 + 54*86 = 4652` bytes; the file is 5514 bytes (862-byte extension).
- Opcode histogram of the 86 records (hex): 2D x29, 3A x15, 11 x14, 12 x11, 2B x9, 0E x5, 33 x3.
  Last record is opcode 3A.
- Control: the first 64 `{event[20]}` records are byte-identical to the direct-CCECL
  GBSX. Text slots are byte-identical except 9 rows (2,3,4,6,50,52,53,55,58; opcodes
  0x11/0x12) where CCFLOW stores a bounded `FF FF 'GBPX'` DREF and direct CCECL keeps its
  historical 32-character inline prefix -- the documented difference, asserted narrowly.
- Mutation: truncating the sidecar mid-extension, or mid the last fixed record with the
  count intact, makes CCEFX print `CCEFX: bad or truncated`.

Gate: `native/ccflow-coab-count-test.ps1` (needs `coab_extracted\Data`, or
`$env:GOLDBOX_COAB_DATA`; SKIPs when absent). Note the task brief said GBSL v1; the
measured file is v2.
