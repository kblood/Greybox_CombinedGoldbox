# CoK original RNG and native ECL/rest — 2026-09-08

> **Current source note, reviewed 2026-10-11:** DoK's original recurrence and ECL/dice
> behavior were independently recovered on 2026-10-07 in [dok-rng.md](dok-rng.md).
> `native/src/ccecl.asm` now selects `use_cokrng` for both KRYNN.CFG and DKK.CFG profiles.
> The September statement below that DoK retains the older recurrence is historical.
> This source selection does not establish DoK combat draw order, seeding or full checkpoint parity.

Original resident routine B628h updates a 32-bit state at DS:43AE using
`(state * 08088405h + 1) mod 2^32`. B5D9h advances first, then returns the
high word modulo its word bound; zero bound returns zero but still advances.
CoK ECL RANDOM at 00BA9h reads a byte maximum and increments it unless it is
already 255. Thus maximum 0 draws and returns 0; 5 yields 0..5; 255 yields
0..254. Variable operands are narrowed to the low byte.

DB:52 at 3520Ch stores the count byte in DS:6B34 and calls the dice loop at
351C1h. Each die advances the same state and adds one to the bounded result.
Count and sides are bytes, sums wrap to a byte, count zero makes no draw,
and sides zero still draws and contributes one per die. The original rest
call at 2B816h uses DB:4D for 1d100; DB:4D resolves to the same dice loop.
The encounter comparison is `roll <= percentage` at 2B827h.

`tools/test_cok_rng.py` passes **296 tests in 15.15 seconds**
(`build/cok-rng-focused.log`), executing unchanged original routines through
the existing oracle. It checks all 256 byte maxima against five seeds,
30 count/sides combinations against five seeds, five variable-word bounds,
and five mixed 80-call opcode/dice sequences. Each result and RNG state is
checked; zero counts/bounds, wrapping, operand PC and preserved party state
are explicit. `tools/cok_rng.py` supplies the resulting portable reference.

Native source `729d08c` adds `native/src/cokrng.inc` and selects it for CoK's
CCECL RANDOM and d6 paths, plus GBBOOT's CoK rest roll. The same 32-bit state
continues through GBEF and camp checkpoint serialization; its width is
unchanged. RANDOM's byte maximum now matches the original boundary. DoK and
generic profile logic retain their existing recurrence and exclusive bound.
The native build adds its source directory to NASM's include search path.

`tools/test_cok_native_rng.py` passes its headless DOS test in **2.21 seconds**
(`build/native-cok-rng-dos.log`). Three profile fixtures each execute all 256
RANDOM maxima, with complete result maps, final PC, count and RNG state
checked: **768 queries** total. The fixtures verify CoK selection and DoK/
generic controls. An initial harness assertion incorrectly expected status 1
for normal exit; native `vm_run` documents and emits status 0, now checked.

This does not claim complete original RNG parity for tactical combat or
other title engines. Those paths need their own source and runtime evidence.
The updated rest checkpoint assertions use the measured CoK recurrence;
full flow/corpus verification is recorded with the release handoff.

## Native combat continuation — 2026-09-08

CCCOMBAT now selects the shared CoK recurrence with `/J`, reading the full
paused RNG from GBEF v9 offset 126. The required GBCR v2 result stores the
final state at offset 12. GBBOOT selects this for CoK and publishes the result
before script resume. Legacy standalone combat retains GBCR v1 and its RNG.
This changes seeded combat damage; it does not establish original initiative,
AI, attack sequencing or byte-wrapped multi-die damage parity.

The DOS fixture covers five full-width seeds and a real host sequence: ECL
RANDOM, two initiative draws, enemy attack/damage, party flee, another ECL
RANDOM, camp save and cold reload. The final state is DD06F316h after six
draws from 1234h. Both checkpoints retain the complete expected 5750-byte VM,
including the camp hook and position-register changes. A GEO fallback bug
previously selected the older paused VM for that checkpoint; the host now
uses the older file only to recover map identity.

Nine child rejection cases and nine host result rejection cases exercise
malformed input and failed output. Host results require exact length, v2,
matching roster count, valid outcome, ordered ordinals and valid conditions.
Rejected results leave the paused RNG and roster intact without resuming.
The child validates the 130-byte prefix it consumes, not the full VM file.
Roster and RNG publication are not a combined crash-atomic transaction.

Exploratory original-code evidence also reached the complete damage routine
14F24h with an explicitly assigned target. The held Houpak attack consumes
the base damage draw and then effect 7's mode-4 replacement draw. This explains
why final damage alone cannot establish RNG parity. The exploratory probe
remains in ignored `build/cok-attack-damage-probe.json`; native effect 7 still
rejects.

**2026-09-08:** `tools/test_cok_effect7_target_provenance.py` turns this into
21 standing, mutation-tested tests calling `14F24h` directly. They confirm the
two-draw sequence exactly against the documented `state*08088405h+1 mod 2^32`
recurrence and identify that `14F24h`'s own second far-pointer argument (not
the synthetic combat context's target field, not the `DS:609A` active-
character global, and not the effect record's applied byte) is what decides
whether the replacement draw fires. See the dated section in
`cok-item-removal-native-plan.md` for the full disassembly evidence and the
open item (14F24h's own caller is not yet located by address).
