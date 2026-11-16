# DoK original RNG — 2026-10-07

Verdict: **DoK uses the same recurrence as CoK**, `state' = state * 08088405h + 1 (mod 2^32)`,
Borland `Random(word)` = `(state' >> 16) mod bound`, bound 0 returns 0 but still advances.
ECL RANDOM and the dice loop have the CoK semantics (see `cok-rng-native.md`).
The CoK/DoK difference is addresses only. Model: `tools/dok_rng.py`; oracle:
`tools/dok_rng_oracle.py`; tests: `tools/test_dok_rng.py`.

## Where the constant is (why no contiguous dword exists)

Unpacked `Death Knights of Krynn/START.EXE` (82,336 bytes; CS base 0A070h, DS 0BCEh):

- Step routine at image 0B6ABh: `mov ax,[84ACh]; mov bx,[84AEh]; mov cx,ax; mul word cs:[1671h]`,
  then shifts/adds of CX and BX (`shl cx,1` x3, `add ch,cl`, `shl bx,1` x2, `shl bx,5`, `add dh,bl`),
  then `add ax,1; adc dx,0` and store back. The low word **8405h is data at cs:1671 (image 0B6E1h)**,
  the high word 0808h is synthesised by the shift/add sequence. Both are why `05 84 08 08` is absent.
- Random(word) entry 0A07:15EC (image 0B65Ch): calls the step, `xor ax,ax`, `div bx` on DX, `retf 2`.
- State dword is DS:84AC. The routine is byte-for-byte the CoK one (CoK: B628h, cs:11FEh,
  DS:43AE, Random at B5D9h) apart from displacements.
- GAME.OVR: no dword 08088405h; the 8405h/0584h byte hits (e.g. 0x4BC5, 0xA125) are mid-instruction
  noise. A scan for any `mov/mov` access to DS:84AC/84AE in GAME.OVR finds none
  (null: the only accessors are in the resident image, B6ABh step, and the seeding code at B6E7h).
  The overlay calls the resident routine via far calls to 0A07:15EC.
- DoK ECL RANDOM handler at GAME.OVR 0A18h (CoK 0BA9h) is the same code: operand byte, `inc` unless
  FFh, `Random`, `+0`, store; dice loop at 30EACh (CoK 351C1h), wrapper 30EF7h stores the count
  at DS:BE71 (CoK DS:6B34).

## Measurements (all re-derived this session, `python -m pytest tools/test_dok_rng.py`)

**300 passed in ~2.4 s**, executing unchanged original routines under Unicorn:

- Multiplier recovered from the original code: seed 1 -> state 08088406h (M+1); 300 random seeds
  (RNG seed 7) satisfy `state' = seed*M+1` exactly.
- ECL RANDOM, all 256 byte maxima x 5 seeds (0, 1, 1234h, DEADBEEFh, FFFFFFFFh): state and result
  match; operand PC ends 8006h.
- Dice, counts {0,1,2,3,255} x sides {0,1,4,6,127,255} x 5 seeds = 150 cases: state, byte-wrapped
  total and stored count match.
- Variable maxima {0,255,256,511,65535} use the low byte; PC 8007h.
- Mixed 40-call RANDOM/dice sequences on one shared state, 5 seeds.

Nulls / mutation (seen RED):

- Model multiplier mutated to 08088404h in `tools/dok_rng.py`: **292 failed, 8 passed**; restored: 300 pass.
- `test_mutation_wrong_model_multiplier_is_detected`: five wrong multipliers (08088404h, a flipped high
  bit, 000343FDh, 015A4E35h, 0808 8406h) each disagree with the original on the 256x5 sweep.
- `test_mutation_patched_original_constant_is_detected`: patching 8405h in the loaded copy of the
  original (8406h / 8404h / 0405h) changes Random's result vs the model.

## Limits

Oracle scope: ECL operand type 3 (stream memory) destination, immediate/variable sources; overlay
relocations are not applied (same as the CoK oracle); the callback-table initialiser was not needed
and not run. This says nothing about DoK combat initiative/AI draw order or the seeding (Randomize)
routine; only the recurrence, bounding, ECL RANDOM and dice are established. The original
2026-10-07 research pass made no native changes. **Current source, reviewed 2026-10-11:**
`native/src/ccecl.asm` now sets `use_cokrng = 1` when DKK.CFG is admitted, and ECL RANDOM
and d6 use the shared `cokrng.inc` path. This supersedes the old 'native DoK still uses its
older recurrence' statement. It is a source-selection check, not a new DOS execution
measurement or proof of original DoK combat draw order, seeding or save continuity.
