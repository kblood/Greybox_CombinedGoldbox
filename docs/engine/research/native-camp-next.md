# Native DOS camp/rest/heal: next implementation boundary

2026-09-07. The user reaffirmed that the deliverable is the DOS Greybox client.
Updated 2026-09-08: camp entry/exit, PreCampCheck, bounded CoK rest/healing and
encounter-hook interruption are implemented. `f614cc1` also adds native CoK
camp checkpoints across process restarts: party, archive/map/pose and cell,
GBEF memory/clock/RNG, healing credit and encounter counter. Cold-process
tests poison initial/pre-camp ECL, verify byte-exact round trips, then continue
rest and exploration. Fifteen invalid-state controls preserve active files;
failed temporary writes retain the completed checkpoint and backup.
The CoK launcher now exposes checkpoint restore through `-Resume`.
`4d450ad` now preserves complete SFX records in GBCP v3 and expires verified
effects during CoK rest. Independent DOS fixtures cover boundaries, duplicate
ids, cold resume and post-expiry ECL queries. Unsupported applied callbacks
and ids 0x0C/0x0E/0x26 stop before the due tick. General ECL CLOCK expiry is
implemented by `54cd36d` inside CCECL, retaining live selection/comparisons/call
stack and working beyond the transcript cap. See `cok-clock-effect-continuation.md`.
Owned CoK spell lookup is implemented in `521c2fb`: all 58 raw queue bytes
per member, retail zero-based slots/owners, and explicit legacy seed precedence.
`d05d8b9` implements pending memorization during rest and GBCP v4 learning
phase/countdowns, including cold continuation and post-rest native queries.
The memorization menu, inventory-backed scribing, complete owned inventories,
FIND_ITEM and the supported item-removal host path have since shipped.
Combat now shares CoK's RNG through script resume and cold checkpoints.
Next: establish a trusted producer boundary for effect-7 staged output before
extending or authorizing GBOC. Static tracing now establishes
`0167AF -> 0162E3 -> 014F24`, whose `DB:34` mode-4 call passes a live target
handle; the callback table resolves effect 7 to `GAME.OVR:010DF0`. The earlier
near-call-only scan missed this far-stub route. See the
[dated DOS handoff](../HANDOFF-NATIVE-DOS-2026-09-08.md),
`cok-memorization-menu-next.md` and `cok-rest-memorization.md`.
The synthetic applied/unapplied oracle now pins direct `+0x18C` callback writes
and existing RNG, damage, die-count, range-count and map-byte observations.
`cm_authorize_output` still trusts the record's asserted damage/draw count after
checking only arithmetic consistency; a 65,535-draw forged record is accepted
by the existing control. `CCINV B` copies the GBOC bytes from an external GBMB
manifest, and current GBBOOT `inventory_run` callers do not invoke B/M/C. Do
not report the callback supported until a trusted producer derives the outputs
from validated combat context and owner/target state and the ordinary GBBOOT
route carries that result into the staged transaction.
Other titles' rest rules and remaining callbacks stay open.
Earlier findings below explain the work and retain their historical boundaries;
their present-tense implementation statements describe the earlier investigation.

The next timed-affect investigation has begun against CoK GAME.OVR. The already
verified clock helper `0x2ADA7` calls `0x2A9CF` at `0x2AE43`, after writing
the normalized clock. That routine walks party members from DS:`0x609A/609C`,
then a per-character far-pointer list at body `0xE3/0xE5` (227/229). Node byte
0 is passed as an id; the word at +1 is compared/decremented, and +5/+7 is the
next far pointer. At `0x2AB48`, zero duration skips decrement/expiry. At
`0x2AB6B`, an elapsed chunk >= remaining duration takes the expiry branch,
which calls DB:`0x2F` at `0x2ABC0`; smaller chunks subtract at `0x2AB79`.
Elapsed time above clock slot 1 is multiplied down using the verified radix
table (`0x2AA39..0x2AA5B`) and processed in chunks of at most ten.

These are static instruction observations, not a completed timed-affect model.
Next resolve the expiry callee and the serialization of these linked nodes;
raw DOS far pointers in a 409-byte character body cannot serve as native
duration storage. Also verify the camp eligibility flags at DS:`0x46B4...`
and the sub-minute path before assigning general timer units. Native CCECL's
`op_ecl_clock` currently only normalizes GBCL and records a script event.

The callback mapping is now guarded by `tools/analyze_cok_rest.py`. Initial
inspection of haste (`0x11B60`) and slow (`0x12034`) changes the next question:
they double/halve scratch byte DS:`0x6B32`, not a character field directly.
Haste also tests/sets bit 0x10 in node byte +3 and increments character word
0x60 only when that bit was clear. Neither inspected callback branches on the
expiry mode argument. Follow the scratch-value producer/consumer and identify
word 0x60 before treating these callbacks as simple reversible stat deltas.
This is a static first inspection, not a verified aging or initiative model.

The first prerequisite is fixed in `8d305ed`: CCPARTY's retail DoK import reads
HP from `.GAM` byte 40 instead of class/level/Con estimates. All six retail totals
are checked under DOSBox, alongside unchanged 216-byte bodies, native character
creation, persistence, and CCCOMBAT import. The new expectations fail against
the former formula. Byte 214 agrees in the six undamaged records; the current/max
assignment of those two retail stores remains unresolved.

Party-state prerequisites before implementing healing:

- In `native/src/cccombat.asm`, `load_gbpr_party`'s `.dok_stats` path treats a
  zero HP word in a valid GBD1 tail as missing metadata and jumps to
  `.dok_fallback`, which assigns 24 HP. The later `.hp_status` already handles
  nonpositive HP as unconscious. A zero-HP GBD1 fixture should retain zero,
  maximum HP, AC and condition, while a genuinely absent GBD1 tail should still
  exercise the legacy fallback. **Fixed in the follow-up:** the new DOSBox
  regression fails against the former branch (maximum 24 instead of 95), then
  preserves all six zero-HP members, their maxima and unconscious status after
  its removal. No party member acts. The missing-tail control retains 24 HP.
- CoK's combat import assigns both `C_HP` and `C_MAXHP` from raw byte 98.
  GBBOOT's `apply_combat_result_roster` writes current HP back to that byte. On the
  next combat import, maximum HP therefore becomes the reduced current HP.
  The existing retail mapping supplies the correct storage: `GAME.OVR` at
  `0xAB1D` reads current HP from `+0x197` (407) for damage/death. At `0xD8D9`
  and `0xD8E4`, morale reads maximum HP from `+0x62` (98), current HP from 407,
  and computes the percentage wounded. These instructions were re-read directly
  with `tools/disasm_cok.py`; `disasm-combat-cok.md` and the retained live-hit
  observations in `cok-improvement-loop.md` corroborate them. The previous note
  overlooked this already-recorded mapping. **Fixed in this continuation:** combat
  import, GBBOOT damage/writeback, save writeback and character creation now use
  current byte 407 while preserving maximum byte 98. The playable CoK flow first
  failed because the injured mage's maximum fell from 4 to 1; it now retains 4
  through persistence and a second synthetic encounter import, without healing
  current HP. The monster loader's initial-HP use of byte 98 is unchanged.
  Noncompact GBPR producers currently use the native CoK 409-byte record layout.

CCFP's `.wloop` now handles C for camp, alongside arrows, G and Esc. Camp
writes the current pose in the 14-byte GBST v1 packet and returns exit 11;
movement retains exit 10. GBBOOT dispatches mode 4 explicitly through CCECL
`/2` and opens Camp with X/Esc to leave, plus R for eight-hour CoK rest.
`GBBOOT /E /2 [ticks]` drives CCFP `/M C` once for headless verification. The
CoK fixture proves unchanged pose, initial-state persistence, only the
PreCampCheck marker written, and no camp entry when the hook halts.

Original camp dispatch investigation (2026-09-08): GBBOOT's `.run_fp_start` accepted
only normal exit 0 and movement exit 10. Its `.step_yield` always schedules
vmRun1 followed by SearchLocation. `build_ecl_tail` only distinguishes handler
modes 2/3 before falling through to SearchLocation; simply assigning mode 4
would therefore call the wrong hook. Add an explicit camp yield and mode-4
`/2` tail branch, and keep the return path out of the movement chain. Prove
unchanged pose and absence of movement-hook effects in a discriminating fixture.
CCECL already selects Gen1 header +12 / Gen2 +10 for mode 4.

The available COAB reference separates entering camp from interruption:
`ovr003.TryEncamp` invokes PreCampCheck, then `ovr016.MakeCamp`; only a true
return from MakeCamp invokes CampInterrupted. MakeCamp returns its
`actionInterrupted` flag, set by rest/magic/fix operations, and restores the
previous game state on exit. Thus a normal camp exit should not dispatch slot 3.
This is reference control flow, not a runtime-verified Krynn camp route.

The condition audit uncovered a shared compact-roster prerequisite and fixed
it first. GBCR stores condition as an enum (0 alive, 1 unconscious, 2 dead,
3 fled), while GBD1's importer consumes C_FLAGS bits (0, 2, 1, 8). GBBOOT
previously copied the enum verbatim. The playable DoK test failed on a real
queued-combat result: unconscious/zero HP persisted as flag 1 (dead), expected
2. GBBOOT now translates the values. A controlled inactive roster checks dead,
unconscious and fled results, persisted flags and unchanged HP over two whole
GBBOOT combat/reload cycles. DQK uses this same compact writeback branch;
its existing quarantined flow is not claimed green by this DoK proof.

For the first rest model, `coab_extracted/engine/ovr021.cs` is an available
algorithm reference. In `resting`, each iteration calls `step_game_time(1, 5)`
and then `rest_heal`; healing occurs every 288 iterations, hence one day at
five minutes per iteration. The variable name `rest_10_seconds` is misleading.
That loop also advances spell learning and tests encounter interruption.
The CoK timer is now independently pinned to retail instructions in
`cok-retail-rest-contract.md` and `tools/analyze_cok_rest.py`: five slot-1
minutes per iteration, 288 iterations per healing call, with area encounter
period/chance at ECL `0x7ED2/0x7ED3`. DoK/DQK confirmation remains pending;
do not advertise these measurements as covering every supported title.

Rest follow-up (2026-09-08): COAB `ovr024.heal_player(0,1,player)` permits
normal, animated, unconscious and dying states, clamps HP to maximum, and
does not heal dead members. Outside combat it changes dying to unconscious
and removes affect 0x4E for unconscious members; the affect transition must
be inspected before treating positive HP alone as waking a native member.
`ovr021.resting` advances the area rest-encounter counter once per five-minute
iteration; at the configured period it resets the counter and rolls d100
against the area's percentage. An interruption exits rest and the caller
runs CampInterrupted. The native host needs elapsed time, a healing remainder
within the current camp, and verified per-title area configuration, not unconditional HP
gain or slot-3 dispatch on every normal camp exit.
CoK's camp entry at `GAME.OVR 0x1D2B1` explicitly resets the healing counter,
so a remainder must not carry across separate camp visits. This corrects the
earlier blanket suggestion to persist it.
The affect-table entry for 0x4E is `ovr013.sub_3B8D9`, which attempts
`ovr024.combat_heal` and re-adds the affect if placement fails. A successful
combat_heal sets status normal. **This is the COAB reference, not CoK's actual
callee.** The new unpacked-stub resolution in `cok-retail-rest-contract.md`
locates CoK healing at `0x36195`: its status bitset accepts 0/1/4/5, caps HP,
and directly converts down to normal outside combat under the per-character
byte-393 guard. Earlier notes called that byte "in combat", but its full meaning
is unresolved; the global combat state is separate. Native CoK rest follows
the verified direct transitions.

The first rest test caught stale GBEF layout documentation: script capacity is
now 64, not 32, so current GBEF length is 5750 and the seven clock words start
at 5736, not 4008. GBBOOT now derives these offsets from the current constants,
validates the full packet, updates clock/RNG before slot-3 dispatch and preserves
all unrelated bytes. The native tests pass 287/288 five-minute boundaries,
dead-member exclusion, HP capping and a period-one/100-percent interruption.
The host keeps healing credit within the current camp and resets it on entry;
neither that credit nor the encounter counter is yet a process-restart save
contract. Cold-boot restoration of campaign clock/ECL state remains next.

Cold-boot investigation: the existing GBSN record carries pose/dimensions, but
no game, archive, area or ECL identity. GBPR carries characters, and GBEF carries
script memory/clock/RNG; reopening these scratch files independently cannot
prove they describe one campaign point. The next save boundary needs a versioned
checkpoint binding those records to stable game/area identifiers, restoring
without executing initial ECL, and validating all sections before replacing
active state. Keep in-camp resume distinct from entering a fresh camp so the
healing-counter reset remains correct. Test an elapsed clock and modified quest
key across a fresh process, plus rejection of a truncated or wrong-game save.

CoK condition import/writeback is now implemented for down/dying/dead statuses
4/5/6. Native combat maps 4/5 to unconscious and 6 to dead. GBBOOT writes new
unconscious normal members as 4 and dead results as 6; it preserves existing
dying and other conditions because GBCR cannot describe their full state.
`gbboot-create-test.ps1` failed on a dead member returning condition 1 rather
than 2, then passed twice with GBPR deleted between runs to force source-save
reload. All 409 bytes per copied source and roster body are checked: only the
three newly down members' status bytes change. The dying counter remains outside
native combat's state model. Next bounded change: bounded rest/healing,
interruption and save/resume on the newly added camp dispatch path.

The next investigation has begun with read-only retail disassembly. In the
damage-state routine beginning at `GAME.OVR 0x38A7D`, current HP at 407 is
compared with the damage argument. Stores at `0x38AE0`, `0x38AF1` and `0x38B18`
assign status 6 when excess damage exceeds 9 (or an existing status-1 member
reaches zero), status 5 for a positive excess below that boundary, and status 4
at exactly zero remaining HP. The status-5 tick path at `0xB915` increments
the auxiliary counter at actions-pointer +14; when it exceeds 9, `0xB93B`
writes status 6. This supports 4=down and 5=dying, but does not yet establish
all save/reload transitions or native representation of the auxiliary counter.
It also exposes an off-by-one question in the older combat note: the message
routine at `0xAB27` compares against HP+10 using `jae`, whereas the state
routine kills at excess >=10. Verify the call linkage and an exact-boundary
runtime probe before changing native death arithmetic from this observation.

2026-09-08 native import probe: six copied retail CoK records with status bytes
4/5/6/4/5/6 and current HP zero emit GBCR 1/1/1/1/1/1, rather than
1/1/2/1/1/2. The executable therefore loses dead status, independently of
the HP storage fix. Reproduction is in ignored `build/probe-cok-condition.ps1`
and its `build/native-cok-condition-prerequisite.log`; run after any native
sweep. The next implementation should make this a standing regression and
cover CoK condition import, GBPR writeback and source-save reload together.

The zero-HP probe now extends `native/ccparty-test.ps1`: clone its six-member
`DOKROST.GBP`, set each GBD1 current-HP word (tail +6) to zero, and retain each
maximum-HP word (tail +26). Run CCCOMBAT with the existing `PARTYFX.BIN` and
`/R` result output; require six GBCR rows with zero HP, the original maxima,
and unconscious status. A second clone with the GBD1 magic removed should
retain the legacy 24-HP maximum. Use isolated probe files and run after the
flow sweep so neither fixture can contaminate its shared build directory.
