# CoK DOS rest contract — retail instruction evidence

2026-09-08. This closes the CoK-specific timer/address uncertainty before
implementing rest in the native DOS camp. It does not implement rest or claim
a live retail session was observed. DoK and DQK still require their own checks.

Reproduce with `python tools/analyze_cok_rest.py`. The analyzer checks opcode
sequences and local call destinations before extracting constants from the
held `Champions of Krynn/GAME.OVR` and EXEPACK-unpacked `START.EXE`.
`python -m pytest tools/test_cok_rest_contract.py -q` checks the measured
contract and rejects seven deliberate instruction/call mutations.

| Meaning | CoK retail evidence |
| --- | --- |
| Enter camp, reset healing counter | `GAME.OVR 0x1D2AC` sets game state 2; `0x1D2B1..0x1D2B5` zeros DS:`0x7136` |
| Advance five units in clock slot 1 per rest iteration | `0x2B7D4` pushes 5, then 1; `0x2B7DB` calls `0x2ADA7` |
| Clock normalization radices | `0x2ACCE` reads DS:`0x3874 + slot*2`; resident startup at unpacked `START 0xA460` loads DS paragraph `0xBC6`, giving image table `0xF4D4` = `{10,10,6,24,30,12,256}` |
| Heal every 288 iterations | `0x2B254` increments DS:`0x7136`; `0x2B258` compares with `0x120`, `jae` enters healing; `0x2B2F4` resets the counter afterward |
| Healing call | `0x2B282..0x2B28C` passes amount 1 and mode 0 to `0xDB:0x84` for each party member; the rest loop calls this counter routine at `0x2B7E3` |
| Encounter period | `0x2B7F3` loads Area2 through DS:`0x4B2C`; field `+0x5A4` gates/informs the period check |
| Encounter counter | DS:`0x4B53` increments at `0x2B7FF`, resets when it reaches the configured period at `0x2B811` |
| Encounter chance | `0x2B816..0x2B820` calls the dice helper with 1 and 100; `0x2B827` compares against Area2 `+0x5A6`, `ja` skips interruption when the roll exceeds the percentage |
| ECL address translation | `0x98BD` doubles the location, adds it to the same Area2 pointer, then stores at `+0x800`; 16-bit wrapping maps `0x7ED2 -> 0x5A4`, `0x7ED3 -> 0x5A6` |

The radices identify slot 1 as minutes: ten slot-1 units carry to slot 2,
six slot-2 units to hours, then 24 hours to days. Thus 288 iterations at
five minutes yield one day and a one-HP healing call. This unit interpretation
agrees with the COAB algorithm reference; the constants and call linkage above
are now independently grounded in CoK bytes.

The counter reset matters: partial healing credit survives repeated rest
actions inside one camp, but a new camp starts it at zero. The earlier native
planning note's generic suggestion to persist a healing remainder across camp
visits was too broad. Saving/resuming an in-progress native camp is a separate
state contract; it must not accidentally grant credit from a previous visit.

Remaining implementation work: consume `0x7ED2/0x7ED3` from persisted ECL state,
advance the existing seven-slot clock and RNG, stop on encounter interruption,
dispatch CampInterrupted, and apply the verified character HP/condition stores.
Timed affects and spell learning also occur during retail rest and remain
separate mechanics to implement. The healing callee is independently resolved
below. A live exact-boundary rest probe remains valuable.

## Healing callee and corrected resident-stub resolution

All 25 distinct `0xDB` far-call offsets in GAME.OVR lead to `CD 3F` stubs in
the unpacked START image. Their procedure offsets have exactly one common
overlay base where every target starts with a Borland prologue: `0x33FAB`.
The healing call `0xDB:0x84` has procedure offset `0x21EA`, hence target
`0x36195`. This corrects the older packed-image base `0x365A6` in
`disasm-combat-cok.md`; that base does not resolve this healing call.

The callee reads status byte `0x188` at `0x361A2`. Its 32-byte status bitset
at `0x36175` begins `0x33`, accepting exactly 0/1/4/5 and excluding dead 6.
It writes current HP at `0x361ED` and caps it using maximum byte `0x62` at
`0x36206`. When per-character byte `0x189` is zero, it converts
dying 5 to down 4 at `0x3622B`; if the global game state is not combat 5,
`0x36246` changes down to normal 0 and the next store sets `0x189` to 1.
The native host must account for these per-character and global state guards.
CoK directly changes status here; it does not use the COAB affect-0x4E helper
described in the earlier planning note. These are static instruction findings,
not a claim that the native rest behavior is implemented.

## Timed-effect expiry and SFX serialization — 2026-09-08

The analyzer now guards the next native implementation boundary too. The clock
routine calls the timer at `0x2AE43 -> 0x2A9CF`. Party effect lists begin at
character body 227/229; each nine-byte node contains an id at +0, duration word
at +1, an applied flag at +4, and a next far pointer at +5/+7. Byte +3 remains
uninterpreted. Zero duration skips expiry (`0x2AB48`); elapsed >= remaining
takes expiry (`0x2AB6B`), otherwise the duration is decremented (`0x2AB79`).
The caller reduces higher clock slots using the radix table and processes at
most ten units per chunk. Camp eligibility flags still need their own analysis.

DB:`0x2F` at `0x2ABC0` resolves through the unpacked resident stub and verified
DB base to `0x34194`. Expiry checks node +4 at `0x341F5` and conditionally calls
the effect dispatcher `0x34153`, whose normal branch uses DS:`0x6B94 + id*4`.
It then unlinks and frees the nine-byte node. Therefore deleting a native
effect ID alone would miss reversal of applied effects. Special ids also take
post-removal branches; their semantics are not yet established here.

The `.sfx` writer takes the same body-227 list, writes nine bytes per node at
`0x1E858..0x1E860`, and follows +5/+7 at `0x1E869`. The Pascal `.sfx` string is
at `0x1E8BB`; the writer appends CS:`0xBE8`. The five held sidecars contain
eight nodes, all with zero duration; one has its applied flag set. These files
confirm layout but provide no timed-expiry example. Stored far pointers are
opaque remnants, not addresses that the new engine can dereference.

Validation: `tools/test_cok_rest_contract.py` now passes 24 tests, including
13 new altered timer/expiry/serialization/table instructions, the held corpus, and
a synthetic word-duration/opaque-pointer decoder check. This is static retail
evidence and parsing coverage, not a native timed-effect feature or a live trace.
The callback table lies beyond the unpacked resident file image (DS base
`0xBC60` + `0x6B94`). Its runtime initializer starts at `GAME.OVR 0x144D5`:
120 paired offset/segment stores cover indices 1 through 120, with index 120
at the special callback DS:`0x6D74`. The analyzer validates the complete store
set and resolves each resident CD3F stub against procedure prologues, grouped
by segment. Segment `0x65` has 112 entries and unique base `0x10BE8`; segment
`0xBA` has eight and unique base `0x2DC0B`. Trying one base for all 120 fails.
Haste id `0x27` resolves to `0x11B60`, slow `0x2A` to `0x12034`; the tool emits
all callback targets. Their individual application/reversal semantics remain
the next investigation before native expiry can safely change character stats.

The haste callback now has a further byte-guarded dependency: node +3 bit 0x10
skips a one-time action; otherwise it sets that bit, uses the Pascal message
"ages" at `0x11B5B` (CS:0xF73), and increments character word +96 at `0x11BB0`.
The raw field values in the six held SAVs are 22, 28, 58, 34, 350, 350, consistent
with that age interpretation. Preserve this node flag alongside duration when
adding native timers, or repeated callback evaluation can repeat the aging.
This does not yet establish when the callback first runs or all expiry modes.
The contract suite now has 26 tests, adding two altered aging-bit/field controls.

## Native rest timer implementation — 2026-09-08

Further pinned evidence closes the rest-specific implementation prerequisites:

- `0x2B6E7` fills the 72 camp timer-cache bytes at DS:46B4 with one. The
  per-member flags are a cache for members retaining positive durations; they
  are not actor-condition eligibility restrictions.
- The SFX loader reads nine bytes at `0x1EBE2`, allocates/links each new node,
  copies the record at `0x1EC6C`, then clears its +5/+7 link words. Surviving
  serialized pointer bytes can remain opaque because reload rebuilds the links
  in file order. The native engine never dereferences these DOS pointers.
- Expiry's additional comparisons at `0x342AB` cover ids 0x0E, 0x0C and 0x26,
  independently of node +4. Native rest must not silently discard these ids
  until their extra removal helper is implemented.
- Haste's tail at `0x11BB4` doubles the byte scratch at DS:6B32. Slow's entire
  callback at `0x12034` halves the same scratch and returns; it has no persistent
  character write. Neither callback checks its mode argument. The applied-node
  expiry dispatcher therefore invokes haste's verified once-aging action when
  its bit is clear. This does not implement their derived attack/movement rules.

GBBOOT now imports complete owner-tagged SFX nodes, stores them in GBCP v3,
and advances durations during five-minute rest ticks. Permanent duplicates,
flags and opaque pointers survive. Safe removals refresh selected/party query
bits and write the remaining SFX records back in source order. Unknown applied
callbacks and the three extra removal cases stop before the due tick, after
persisting any earlier completed ticks. A whole-tick preflight prevents partial
actor changes. General ECL CLOCK timing and spell application remain separate
work; a full retail campaign or live retail rest trace is not established here.

The retail contract suite has 32 tests, including altered loader, cache,
post-removal, haste-tail and slow instructions. The standing DOS creation/camp
test supplies timed fixtures because the held SFX corpus contains only permanent
nodes. It compares complete persisted nodes/character bodies and calls CCECL
after cold restore to test the resulting ownership queries.

`54cd36d` adds synchronous CoK ECL CLOCK timing. Three further altered-instruction
controls pin unsigned step-byte loading, no scaling for slots zero/one, and
low-word multiplication for higher slots, bringing this contract to 35 tests.
The native VM applies verified callbacks before the next instruction and uses
GBPS v5 to exchange updated timers and age deltas with GBBOOT. The clock/event
ordering and host persistence tests are documented in
`cok-clock-effect-continuation.md`. Spell memorization remains the next boundary;
its initial static findings are recorded in `cok-rest-memorization.md`.
