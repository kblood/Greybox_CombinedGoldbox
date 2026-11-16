# Greybox native DOS engine (`native/`)

## CCNEXT preparation path storage — production checkpoint 2026-10-13

Normal public CCNEXT now reuses `rw_paths[0:1120]` for the ten preparation paths;
the independently validated `/P` lifetime ends before reward RW/RZ use. The
11th ITEM slot, headers/context, buffers and final 512-byte stack remain separate.
Standalone callers retain the original allocation. Compile public CCNEXT with
`CCNEXT_NO_PATH_OVERLAY` to reproduce the previous binary exactly.

All26 targets build at source SHA-256
`2e6bd736efec6823e3a6dc51fe39ab539a8efa26babe855d028408774db1f22d`.
CCNEXT is63787 emitted/64043 resident/1237 free, SHA-256
`73c77198988215c00c99f625f1cfb9a492d892208c446282519a52db6dee2c14`;
opt-out is64907/65163/117 and reproduces `1cf5774e...51ca`. This is a storage
change only: ENTRY provider/comparator remain private, with no ENTRY installer,
dispatch, UI, XP, format or limit change. Production-backed focused tests pass138.
Luna's production GameLink fresh/retry/cold/refusal pass is complete. The latest
complete measured rosters pass46/46 flows and46/46 scripts, bound to repository
head `b953dcd5a1f424be54ab679f1694dcee2c58f03e`, native source commit
`b72641e09792ca0c74400324d7d2a40ec68cede0`, tree
`e96f456b209ac2dad08fa0f4a7a24f95d35a19f1`, and content hash
`66419a5cb6785a5ff8ab4e8cb86691eb306deba4fc67ef18d6adddad3648247e`; both
reports have `native_src_dirty=false` and no source changes during either run.
The full corpus passes13,754 tests with7 skipped and84 warnings in2951.31s
(49:11), exit0, on the current tool/test/status revision. The earlier
13,731/7 skipped/84 warnings result predates the latest native-source and test
changes. The older 13,728/3-failure run remains superseded evidence. See [the
differential contract](../tools/native-probes/ENTRY-OVERLAY.md).

## Task249 release verified — 2026-10-12

Secret PRINT/PRINTCLEAR retains complete original packed narration through
typed GBSL2/GBPX extension2, with exact append and bounded finite paging.
Canonical read-only dispatch paths, typed horizontal-menu2B support and the
last-page ES-preserving caption copy are included. Legacy extension1, DAX and
no-reference GBSL1 policies remain unchanged.

Final focused tests pass2074 in128.30s, exit0, plus5 patch-context checks. Root's
independent run passes357 in23.62s, exit0. All26 tools build and match the V3
freeze: raw native source SHA256
`8ee8652e83b34cb51dcafba8324877dbfd27e976c17618c3bad5c88fccdc3ab9`.
CCECL24855/65216/64, GBBOOT64575/64831/449 and CCFP24840/61494/3786 retain the
documented floors. Seven tools change relative to released248;19 stay exact.

Luna's ordinary public V3 run displays full155/119 paragraphs as117+38 and117+2,
then the exact52-character composed journal, correct menus and real responses.
Returns393/490/517, seed1234 and currentP1 remain source-bound. Page transitions
preserve58/58 and72/72 files. Live/cold/repeat POST compares72 files,69 exact,
allowing only config clone paths, fresh/Resume batch bytes and `_GBRES.DOP`
u64 offset8 generation3 to4; cold/repeat differs only in its config path.

Actual old248 INITIAL/ACTIVE no-answer reopening retains the old32-character
output and owned state. An old INITIAL real answer creates a full119 codec2
successor, whose no-answer reopen also preserves semantic state. Authored255/70
completion and four public negatives pass: futurecodec3, truncatedstream,
foreignsource and validforeignP1 preserve all67 session/43runtime files and add
only LAUNCH.BAD. No counter or authority exclusions apply to those negatives.
Clean unchanged implementation `c1d6a7f9` passes44/44 flows and46/46 scripts at
canonical native SHA256
`f44eb44e35c0fca81627099da600958a157d06b657f0ec8659e33087addf5b62`.
Full boot passes248 markers with0 failures. Corpus passes11,711 /1 skip /
84 warnings in738.51s, exit0 (11,712 collected). Retail file writes are zero;
the recorded directory touches are DQK DOSBOX in the flow sweep and DQK/DoK
DOSBOX in the script sweep.

App gates pass engine3061 /3 skips, four typecheck/web/author/Electron build
commands, and web189/intros10/author8/Electron9. Fresh merged Rust/C passes96
actual units and14 verification commands, including8851 legacy positives /
31 negatives, all49, fresh main/default/chunk7/budget comparisons, EGA539 and
OPL60. Source, retail and artifact pins remain unchanged; fresh release CLI SHA
is `394bf4d13986ce8c1584452e57b25ef2962ffac28d10eca1b3f95faf281248a7`.
Evidence is under `C:/temp/GoldBox-task249-20261012/release-gates`, including
`rust` and `web-apps`. Release `3e1158cdf3bfee73e3bcd925322d7f10874a6d66`
is verified against local and SSH remote HEAD with a clean release tree;
`release-gates/release-head-verification.json` records that check.
The isolated, pinned DOSBox-X GameLink candidate preserves key/button release
across graphics/text mode changes; paired old/new probes verify its behavior.
Select its manifest `candidateExe` explicitly with `-DosBoxPath` or `-Dosbox`;
see [the tool recipe](../tools/dosbox-gamelink-build.md) and
[the PRINT contract](../docs/engine/research/secret-print-contract.md).
The installed emulator and retail default remain unchanged.

## Task248 release gates verified — 2026-10-12

Explicit SecretAmiga composes separately bound Amiga data and DOS pregens into
a persistent player snapshot. Ordinary fresh entry and existing-only Resume
pass actual public fresh/live/cold/strict/reopen and six negative controls.
RUNGB.BAT fixes the public DOS8.3 batch failure. CCNEXT validates INITIAL kind3
against the complete current P1 before answer access or READY; exact public
foreign-P1 rejection preserves14/14 native artifacts. Legitimate GKB/GKT recovery
remains supported. Compiled OLD RED precedes746 passing focused controls.

Only CCNEXT adds7 bytes, retaining34156 free; other25 tools are unchanged.
CCECL24851/65212/68 and GBBOOT64535/64791/489 retain64/128-byte floors and
14500/16000 input bounds. Implementation `a17fa3f5`, measured at `dacef80a`,
passes clean44/44 flows,46/46 components, full boot248 RESULT controls and
11,362 corpus tests /1 skip /84 warnings in717.95s, exit0. All26 final hashes
match Luna's frozen set. Source canonical SHA256 is
`73e0076a8702f5abb0093dd86dfccb5aefd7f9fdbd65987ebb089b545ff6dbfd`.
There are zero retail-file writes; known DOSBOX directory timestamp changes
are recorded separately. All required app gates also pass.

The verified gameplay boundary is a source-owned menu with native party and
seed; original saved-party restoration and campaign completion remain unverified.
Task249 selects complete Secret opening narration, with original rendering proof,
OLD RED and the64-byte CCECL floor required before implementation.
See [the player-session contract](../docs/engine/research/secret-player-session-contract.md).

## Task246 historical implementation checkpoint — 2026-10-11

Secret selected getter7CA7 now reads unsigned normal actor byte245 through
closed GBWN3/GBSF2, retaining physical current-P1 row order. Old GBWN2/GBSF1
continues to authorize its original six fields and cannot authorize7CA7;
names-only packets grant no actor fields. Null reads the live DOS byte245.
GBBOOT and CCNEXT require a current seven-column reply on each owned refresh.
Secret opcode03 uses original-proven unsigned ordering, and unavailable fields
halt before publishing comparison words or stores. Deferred operands stay on
the stack across legacy getters that reuseT0.

The field bank shares the348-byte CoK spell bank after compiled poison/reset,
both title orders and complete sixth-row spell-slot controls establish exclusive
lifetime. Packed14500/decoded16000 bounds and64/128-byte operating floors remain.
All26 targets build; CCECL24842/65203/77 free, GBBOOT64539/64795/485 free.
Focused original/native/transport/frontend and legacy flag checks pass767,
exit0. Luna's accepted old-binary RED shows controlled35 versus0 for MALACHITE,
where original execution requires70/LT. This was the pre-runtime checkpoint;
subsequent actual/manual/cold/repeat and source-bound releases are recorded in
the current HANDOFF and the task248 summary above. See the
[trap-read contract](../docs/engine/research/secret-trap-read-contract.md).

## Task 244 verified — 2026-10-11

Native Secret WHO uses the source-proven packed prompt and current owned P1
names. Enter preserves current/null; Up/8 and Down/2 wrap; Escape waits.
Duplicate names keep distinct visible ordinals. Typed Pascal name replies and
GBEF16 nullable identity persist through actual combat, cold and repeated runs.
True INITIAL kind3/GBIR captures pre-input state without a fabricated HP result.
Strict read-only CCNEXT `/D` admits Secret streams and rejects unsupported
mutations. Generic CCHOST and genuine older non-WHO compatibility remain intact.

All17 tools build: CCECL24,393/64,750/530 free; GBBOOT64,315/64,571/709 free.
Actual WHO/combat cold/reference compares13 artifacts exactly, preserving hero6
at HP0 and strength74→62. Maximum-context and70-PRINT routes preserve source
files. Final clean gates pass44/44 flows,46/46 components, and9,672 corpus tests
/14 skips, exit0. Final native implementation is `5010ffb4`; source canonical hash
`a617748872f6d9d0727064324743a05c7b28c68f49bc6ee8c1839b2d10d3b599`.
See [the source contract](../docs/engine/research/secret-who-contract.md) for
scope, original execution evidence and compatibility limits. Task245 selects
source-owned selected-actor field reads; the continuous native goal stays active.

## Task 243 verified; task 244 selected — 2026-10-10

Task 243 is verified at native implementation `3cc0782c`, with audit/gate record
`a585ba15`. Explicit Secret-long GLIB handling fixes the actual area16/3 early
exits while preserving ordinary Gen2 decoding. Secret1Dh stores the byte metric
without changing comparisons. CCPARTY read-only queries derive normal values
from current owned P1; GBBOOT queries before execution and CCNEXT after settlement.
Derived values stay separate from frozen explicit `/Z`, which bypasses query IO.
GSK3/GBNR3 and GBRS bit2 distinguish the new semantics; old and foreign records
reject/preserve before mutation. WHO remains unsupported.

All 17 tools build. CCECL is 23,614 emitted/65,205 resident/75 free, above its 64-byte
floor. GBBOOT is 62,106 emitted/62,362 resident/2,918 free. Integrated focused
checks pass 893; cleanup controls 165; audit controls 195, all exit 0. The first full
corpus exposed44 stale audit assumptions; their corrected numeric comparison
parser and source guards preserve coverage and negative controls.

Luna's clean integrated standing run exits0 in 69.0s. Actual default areas16/3
reach LOAD_PIECES at002D/0027 and combat. Live authored1Dh metrics74 before/62
after combat match the portable normal projection and complete original oracle.
Authentic STOP88 capture, uninterrupted, cold and repeated recovery preserve
current P1 and absent `/Z`. Cold/reference EFX and roster are byte-identical;
GBCR changes only its consumed word 0→1, with trace/raw/seed unchanged. The retail
terminal pin changes only at byte 120 from 0→4. DOS mechanics over compatible
Amiga assets are the contract; original Amiga executable equivalence, transient
buffs and saved-game restoration are not established.

Final clean serial gates pass 44/44 flows and46/46 components, exit 0, with no
retail file writes; only known DOSBOX directory timestamps changed. Both bind
unchanged source at 3cc0782c to canonical SHA256
`0869798ddcb1a4dccdc8ad54eb9a5f5e8b9b16f39ccb15f57541d5617a0a8b45`.
Full corpus rerun passes 9,039 tests /14 skips /84 warnings in 710.44s, exit 0
(collection 9,053). Runtime is idle. Evidence is external at
`C:\temp\GoldBox-task243-20261010`, including the preserved first corpus RED,
final gate logs and `runtime-integration-final3`. No website work was involved.

Task 244 is selected: prove and implement Secret WHO from original instructions
and current owned actor identity. Original dispatcher458B maps39h to descriptor 3
file 0x3DEC..3E51. The caller prefetches one operand, copies DS:90AC prompt text and
calls descriptor 26 file 0x3B7F3 with DS:7D38 as an actor pointer output. These are
source leads, not executed selection/cancel/participation semantics. A conservative
five-entry-root census of 22 held GLIB members finds 15 WHO sites and no malformed
visited offsets; the operands are packed prompt strings. It is not full computed-
jump or original Amiga executable proof. Execute the complete original caller/
selector with declared party/UI state, prove eligible traversal, selection,
cancellation and side effects, then bind native menus to admitted GBPR3 identities.
Preserve frozen context, compatibility and memory reserves; complete original/
native differentials, actual GameLink flows, cold/repeat controls and final gates.
The continuous native DOS objective remains active.


## Sidecar prompt automation — task 242 verified 2026-10-10

Task 242 is verified at `b17225de` (runtime record `d4c52eab`). CCFP's
two-path pending mode interprets /S as checked unsigned 16-bit automation, renders
ordered narration without keys, and publishes the bound response only after
full stream/terminal admission. Sticky read faults reject before output. V1
text paging preserves video ES and uses DS; write/close failures remain failures.
Ordinary snapshot filenames and manual input retain their behavior. Automated
/S plus diagnostic /Z rejects cyclic slot navigation; ordinary /Z remains.

All 17 engine builds, 61 compiled checks, both standing harnesses and real DAX
ACK regression pass. Actual numeric 0/1234/65535, PARTY Yes/No branch markers,
canonical ACK 1/1, manual GameLink and numeric snapshot controls pass. Cold runs without /C and with conflicting /C1, plus repeats, preserve the
saved 65535 and match the complete all-context independent reference. Roster, result, seed and combat trace/frame stay unchanged.
Final gates pass: 44/44 flows, 46/46 components and 8,711 corpus tests with
14 skips and exit 0. The corpus reports 84 warnings in 588.23 seconds.
Both native suites bind clean unchanged source to canonical SHA256
`f2001e4d71d74184c73c37b744f1ad93db689fd07fa2963818a50af05118b154`; no retail files changed, only DOSBOX directory timestamps.
CCFP emits 22,877 bytes, uses 59,531 resident bytes and has 5,749 free.
CCECL is unchanged at 84 free.
No crash-atomic response publication, saved-game restoration, new WHO or
original party-strength fidelity is claimed. Evidence remains external at
`C:\temp\GoldBox-task242-20261010`.

Task 243 first proves the original Secret 1Dh contract before replacing the
CLI comparison. See the [handoff](../docs/engine/HANDOFF.md).

## Durable invocation context — task 241 verified 2026-10-10

Secret GSK2/GBCX1 authority retains six effective CCECL scalar inputs, the
distinct full-word host answer, presence and interactive mode. Recovery restores
saved context, clears absent fields and overrides conflicting cold CLI. Legacy
GSK1 and future schemas cannot supply authenticated missing values and reject
with bytes preserved; no migration defaults are inferred. Implementation is
`8172581b`.

Actual context/reference/cold/conflict/repeat, numeric automation, maxima,
zero-absence, exact source-alias and 72-event headless capacity checks pass,
together with 835 focused checks and all 17 builds. Final 44/44 flows, 46/46 components and corpus 8,650 passed / 14 skipped / 84 warnings, actual exit 0 pass.
Both suites bind clean unchanged canonical source `ef26e1d0b984c6946b4fdc09b732bee0a7341c9cfa2321acb51c6fe3a948aba1`.
GBBOOT retains 3,606 free bytes; CCECL is unchanged at 84 free. This transports
supported inputs; it adds neither Secret WHO nor original party-strength
fidelity, general world saves or power-loss guarantees.

Task 242 remains open: sidecar prompts routed to CCFP still treat GBBOOT's /S
answer as a snapshot filename and wait for keyboard input. The actual bounded
no-key RED published no GBMO; headless capacity transport does not prove this
interactive automation. See the current [handoff](../docs/engine/HANDOFF.md).

## Full-width automated numeric answers — task 240 verified 2026-10-10

`GBBOOT /! /C1234` now passes 1234 to CCMENU instead of truncating it to 210.
The full unsigned 16-bit range 0..65535 is preserved; ordinary noninteractive CCECL
menu seeds remain byte-sized. Invalid numeric /C inputs reject before startup
writes, and symbolic combat tapes retain their behavior. Implementation is
`271e8a9c`. Seven-width standing coverage, closed-answer cold/repeat recovery,
39 compiled checks, 248 GBBOOT engine-smoke results, all 17 builds, 44/44 flows,
46/46 components and corpus 8,497 passed/14 skipped pass, exit 0. GBBOOT has 4,016
free bytes. A separate preexisting Secret post-combat CLI-context omission is
addressed by task 241's verified GSK2 integration.

## Secret completed-combat continuation — task 239 verified 2026-10-10

The engine build now includes `CCNEXT.COM`. For the explicit Secret Amiga
`/9 1` owned-party route, GBBOOT prepares durable `.GSK` authority before
combat, binds the completed result, settles HP through CCHOST, and publishes
the resumed ECL cursor before dispatch. The owned `.GKW` directory and its
`OWNER.BIN` marker are part of that durable state; preserve them with the roster
and authority when moving a workspace. Source GLIB identity must still
match exactly. This bounded continuation is not original saved-party restoration.

Actual DOS cold recovery reaches the same terminal PC04A5 and VM bytes as an
uninterrupted six-player area16 run, with the independently projected HP result
and unchanged combat trace/frame. Repeated cold boot preserves the same state;
a separate before/after-combat marker fixture also matches its reference.
Standing coverage passes, as do 643 focused checks, all 17 builds, 44/44 flows,
46/46 components and the full corpus (8,458 passed /14 skipped, exit 0).
Implementation is `ff34c8f0`; `d35f970f` adds the coordinator to the release
manifest. Unsupported
external effect mutations fail admission; full campaign/title support and
power-loss integrity are outside this slice. See the current
[handoff](../docs/engine/HANDOFF.md) for verification status and limitations.

## HLIB MONCHA integrity follow-up — 2026-10-09

DOS HLIB monster members now require a nonzero BE declared length within
2,048 bytes, complete literal/repeat runs, exact decoded length and complete
member consumption. The codec's `0x80` no-op is accepted before or after
output. Malformed trailing controls reject instead of becoming a successfully
loaded record or a combat placeholder. The existing GLIB paths remain separate;
their headerless-generation framing/stat-layout gaps still need research.

`cccombat-hlib-moncha-consumer-test.ps1` is required by the component roster.
Luna observed the archived binary admit seven malformed fixtures and mishandle
the no-op control. The repair passes all twelve cases: eight malformed members
produce exact `bad effect` and no combat artifacts, while four valid controls
preserve source-derived HP/attack pins, outcome and nonblank framebuffer,
including exact 2,048-byte output. The retail DQK encounter's trace, outcome
and frame match the archived binary byte-for-byte; the existing five-case GLIB
smoke also passes. The 41 HLIB checks cover all 98 DQK and 127 FRUA
records byte-for-byte, malformed runs, no partial writes from invalid first
runs, individual removed guards, caller carry and the actual fixture encoder.
The initial focused checks passed 127 tests before the seven encoder controls
were added. The broad component pass caught that encoder's invalid 129-byte
literals; 128-byte chunks preserve the existing numeric trace assertions.
The full flow sweep passes 44/44 and the refreshed component sweep 46/46.
The 16-target build measures CCCOMBAT at 32,208 emitted / 32,464 resident /
32,816 free bytes. Runtime evidence is outside source at
`C:\temp\GoldBox-task234-20261009`. Full corpus passes 6,605 tests / 14
skipped / 84 warnings, exit 0. Task 234 is closed. The full flow/component
artifacts bind clean, unchanged native source at `a6c52623`, hash
`8f49ba2ff691e3d0d3abd9d610466aa6f13aa9914b435cdd9bbc950f61d05aaa`.

## MONCHA input validation follow-up — 2026-10-08

`CCCOMBAT` now bounds DAX RLE reads to the selected compressed member and
checks each literal/repeat run against the declared decoded size before
writing. Decoder errors propagate to the encounter loader. A malformed
2,048-byte record previously wrote 2,160 bytes into adjacent combat tables.
Unused trailing compressed bytes retain their existing behavior.

`cccombat-moncha-bounds-test.ps1` is required by the component roster.
Luna observed malformed literal, missing repeat-value and oversized-run
fixtures publish combat outcomes on the old binary; the repair rejects all
three with `bad effect` and no outcome/trace. Valid combat before and after
these cases has identical trace and outcome. A valid 2,048-byte decoded
record remains unsupported by the game-record parser; the isolated assembler
tests separately prove exact-capacity decoding with adjacent-memory checks.
The 23 live NASM/Unicorn tests cover valid runs, malformed runs and individual
guard removals. That October 8 build measured 32,040 emitted / 32,296
resident / 32,984 free bytes; the current HLIB follow-up measurement is above.

The GLIB smoke now fails on present malformed optional Amiga sources instead
of skipping its mandatory synthetic parity checks. Missing optional sources
still run those checks; missing DOSBox still produces an early explicit SKIP.
Runtime evidence is outside source at `C:\temp\GoldBox-followup-20261008`.

A clean-room, hand-written **x86 assembler** Gold Box / "Unlimited Adventures–like"
engine, built to run the Krynn trilogy natively under DOS. This is the asm track
chosen 2026-06-24 (over a C rewrite) — sibling to the TypeScript engine in
`packages/engine`, which stays the web/authoring deliverable.

## CoK/DoK compatibility status

CoK and DoK each have a reproducible, original-data, headless-DOSBox vertical
slice: native boot, compact-party create/load, first-person exploration, a
natural map/ECL encounter, native tactical handoff and result writeback, then
bounded exploration resume. This demonstrates that the DQK-class native path
can execute real content from both older games; it does **not** yet mean either
campaign is fully playable. Broad map/ECL/menu coverage, combat rules and UI
parity, transitions, arbitrary-save compatibility, reward/consumed-event
persistence, and remaining artwork banks are still implementation work. The
evidence and acceptance boundary are maintained in
`../docs/engine/research/native-cok-dok-compatibility-plan.md`.

## ECL host CALL (0x2D) dispatch — partially real, 2026-09-09

`../tools/ecl_host_call_coverage.py` now measures **5,749 of 27,821**
CFG-reachable CoK/DoK retail ECL instructions as recorded-only (**20.7%**):
2,904/13,544 in CoK and 2,845/14,277 in DoK. The remaining **22,072** reach
applied handlers; recorded-only means an opcode reached a recorder without a
matching native state effect.

## Gen1 AWARD_XP (0x41) — CoK and DoK applied, 2026-09-12

`ccecl.asm` now admits and dispatches the shared two-word `0x41` frame to
`op_award_xp`. For a valid non-DoK GBPR sidecar, it reproduces CoK's retail
split: count positive CCH `+0xF9` records, divide the 16-bit amount by that
count, then add the zero-extended quotient to eligible CCH `+0x116/+0x118`
32-bit XP fields. A nonzero mode updates all eligible party entries; zero mode
uses the selected `LOAD_CHARACTER` member. The headless smoke creates a
three-member fixture and proves party/single-target updates, `/2` truncation,
32-bit carry, and no write to an ineligible entry.

For a valid DoK compact GBPR, CCPARTY stores a next-level threshold for each
active class slot in the unused GBD1 tail and marks that cache with flag bit 2.
CCECL then divides the 16-bit award independently by each member's positive
`+0x45..+0x4c` class-slot count, adds the share to raw u32 `+0x62/+0x64`, and
sets `+0xc6` when the updated XP reaches any nonzero cached next-level value.
Party mode updates every valid compact member; selected mode updates only the
current `LOAD_CHARACTER` member. A missing or malformed cache remains a
recorded effect and makes no roster write. The headless fixture proves member
splits, selected mode, u32 carry, threshold readiness, zero-slot no-write, and
the missing-cache guard.

The compact `.GAM` record's u32 `+0x62/+0x64` XP field and post-award
recalculation are recovered from retail:
`0x00cf:0x011a` resolves through VROOMM public stub 50 to
`GAME.OVR:0x35a5e`, which writes the `+0xc6` level-readiness result. `START.EXE`
initializes DS to `0x0bce`; its image contains the exact 2,244-byte threshold
matrix at `DS:7638` and seven eight-slot caps at `DS:82d4`, while the category
helper is pinned at `GAME.OVR:0x359c3`. CCECL does not embed the 2,244-byte
matrix: CCPARTY derives the compact cache while it has room to carry the exact
table subset needed for levels 1..17.

## DoK combat-result XP persistence — applied, 2026-09-14

`CCCOMBAT` now carries its source-derived DoK kill total in a v1 `GBCR`, and
`CCHOST` applies a party-victory total to each valid compact member with the
same positive-class-slot divisor, u32 XP addition, and cached readiness test as
`CCECL`'s `AWARD_XP` handler. It also writes raw `+0x62/+0x64` XP and `+0xc6`
readiness back to an original `SAVE\CHRDATA#.GAM` slot, so the next CCPARTY
load retains the award; high-bit native slots remain GBPR-owned. A compact
party without the verified threshold cache still receives HP/condition combat
writeback but receives no XP mutation.

The end-to-end DoK flow runs the retail Cekos/Sivak encounter against the
shipped six-member party (a measured 570-XP victory), verifies the member-local
splits in both GBPR and copied `.GAM` saves, cold-reloads them, and replays the
same consumed v1 result to prove it changes neither sink. Before each populated
v1 handoff, CCHOST writes a bounded `GBTX` sibling containing the exact fresh
GBCR. After the roster, source-save, and optional WIZ writes finish, it advances
that record to finalizing before setting GBCR's consumed word. If that final
receipt write fails, the next CCHOST process verifies the same result and
finishes only the receipt; it does not re-award XP or consume a second spell.
`cchost-test.ps1` injects that final-write failure under DOSBox. An interruption
before the record reaches finalizing restores the appended exact GBPR preimage,
the exact low-numbered source-save field preimages (rather than reconstructing
them from GBPR), and an active 220-byte WIZ sidecar, removes the record, then reapplies the original result once. The
same DOSBox contract stops directly after that recovery to compare all three
preimages byte-for-byte before allowing the ordinary retry. CoK's separate
v2 RNG/effect publication and broader checkpoint/inventory generations remain
outside this bounded v1 host transaction.

A normalized native roster does not imply that a title has a private `SAVE`
tree. During GBTX creation, DOS error 2 (missing source file) and error 3
(missing `SAVE` directory) both mean the slot has no retail source mirror; the
GBPR handoff still commits normally and creates neither that directory nor a
stray journal. `cchost-test.ps1` exercises this DQK-class control in its own
empty DOSBox root.

## Direct DAMAGE operation-token format gate — 2026-09-20

Legacy `CCHOST /D <effect> <roster>` remains supported. Its opt-in form,
`CCHOST /D <effect> <roster> /T <token>`, validates `<token>` before opening a
DAMAGE sink: it must be an exact 16-byte `GBDO` v1 file, with kind 1 and a
nonzero little-endian u64 generation. A supplied missing, short, trailing, or
malformed token rejects the request without changing the token, effect, or
roster. This is a format gate only, not exactly-once delivery: GBDO does not
bind an effect or roster, a valid token can be reused, GBBOOT still uses
`CCBIND /W`, and the direct-DAMAGE journal/recovery protocol remains open.
*(Ended 2026-09-23: GBBOOT now uses `CCBIND /N` and journals DoK direct
DAMAGE; see the next section.)*

## GBBOOT direct-DAMAGE journal wiring (DoK) — 2026-09-23

For Death Knights of Krynn, GBBOOT runs `CCHOST /R <roster>` once at
boot, before the camp-checkpoint branch, so `/5` camp loads are covered
too. Exit 0 continues the boot. Exit 1 means the party is locked: CCHOST
prints its own reason, GBBOOT prints `GBBOOT: native preview failed;
gate 35`, and the DOS exit code is 3. A normal DoK boot therefore shows
one CCHOST line in text mode before the title, usually
`CCHOST: effect damage journal absent`.

DoK direct DAMAGE is now `CCHOST /D <effect> <roster> /J`, with both
paths in long `X:\NAME` form. GBBOOT's effect binding uses `CCBIND /N`
for every title, so a `.DOP` operation token now sits beside each
effect stem. CoK and DQK direct DAMAGE are not journaled.

This makes one interrupted direct-DAMAGE write recoverable. It does not
make a GBBOOT session crash-safe: after a crash the world restarts from
the last camp, and damage from events that completed stays applied.
This wiring is not yet part of a packaged release.

The GBBOOT flow for this contract is `gbdok-journal-flow-test.ps1`.
Format and full contract: `docs/engine/direct-damage-journal-v1.md`,
amendments J, K and L.

## Live Cast rejection preserves the turn — 2026-09-14

`C` currently owns only DoK Magic Missile: the acting compact member must have
a verified prepared raw WIZ id 15 and a living target. In a normal `/K` combat
view, an unavailable or exhausted Cast displays the existing unavailable notice
and returns to that same actor's command prompt; it does not become an AI turn,
advance initiative, consume RNG, or write a combat receipt. Headless command
tapes retain their explicit `reject ... C` trace and End-equivalent behavior.
`cccombat-test.ps1` drives `/K /C C G` and compares its complete tactical trace
with a `G`-first control, so the reprompt and no-mutation contract are both
covered without host keyboard automation.

The dated measurements below remain controls for the earlier `op_call` change;
they are not the current coverage total.


Part of that finding was `op_call` (opcode 0x2D `CALL`): it computed
a routine id and compared it against seven named constants, but every matching branch landed on
code character-for-character identical to the "no id matched" fallthrough — seven comparisons
selecting between two identical paths, a research annotation rather than live dispatch.

**Fixed the same day, PARTIALLY, by the ecl-op-call-real-dispatch item.** `src/ccecl.asm`'s
`op_call` now gives three retail-confirmed matches genuinely distinct native
state/trace output, each ground-truthed against the COAB decompile
(`../coab_extracted/engine/ovr003.cs`'s `CMD_Call` switch and
`../coab_extracted/Classes/DaxFiles/DaxArray.cs`'s `NextFrame()`) rather than the comment text:

> **CORRECTED 2026-09-10. The two occurrence counts in the bullets below read `307` and `114`
> from the day this section was written (`f015c0e`, 2026-09-09) until this correction, and
> NEITHER was ever right.** They are quoted here rather than deleted, because the way they were
> wrong is the useful part.
>
> `307` is not a superseded measurement — it is **arithmetically impossible on its own terms**.
> CoK has 155 reachable `CALL` sites in total, so no routine id can occur 307 times in CoK; the
> figure exceeds the entire population it is a subset of, by a factor of two. `114` for `0xE804`
> is wrong less spectacularly but in the same way. The correct values, straight from
> `call_routine_id_census` in `../tools/ecl_host_call_coverage.py`'s report, are **112** (all
> CoK) and **69** (24 CoK + 45 DoK).
>
> **The correction is not the finding; the propagation failure is.** Both figures were caught
> and retracted **the same day, in this same repo**, in
> `../tools/ecl_host_call_coverage.py`'s module docstring — which says in as many words that
> "307 cannot be a count of anything `0xae11` does in CoK". That retraction never reached this
> file, so for a day the repo simultaneously held a written proof that a number was impossible
> and a document stating it as fact. This is the repo's own documented signature failure mode
> (see `../CLAUDE.md`, "a TRUE claim filed under the WRONG SUBJECT" and the round-38 subject-check
> item) in its other form: a FALSE claim correctly retracted **in one place only**. A retraction
> is not complete when it is written; it is complete when every copy of the claim carries it.
>
> **Unaffected by this, and do not conflate the two:** the separate 2026-09-10 re-measurement
> that moved the AGGREGATE figures in this section (5,458/26,815 -> 5,749/27,821) was a
> legitimate widening of the reachable frame by the `0x41` decoder port. `112` and `69` are NOT
> products of that widening — `0xE804`'s 69 is unchanged by it — and neither number is affected
> by anything `ccecl.asm` does. **The ARGUMENT these two bullets make is untouched.** `0xAE11`
> is still the highest-occurrence id in either title and still the right one to ground first;
> what changed is only how many times it occurs.

- **`0xAE11` "redraw dungeon view"** (**112** CoK occurrences) and **`0xADCC` "redraw dungeon
  view"** (**109** DoK occurrences) — CoK's `GAME.OVR:0x3c07` and DoK's `GAME.OVR:0x2ab1` use homologous CALL dispatchers;
  their first arms compare these respective ids before entering their title's view path.
  The native host records the shared, bounded part of that behavior: the retail routine unconditionally
  reads the current dungeon position before its conditional bigpic/wall-type refresh. This VM
  has no GEO wall grid loaded (this `.COM` takes none), so the wall/roof id itself is **not**
  computed. What is reproduced: a snapshot of the position/facing sparse-memory cells
  (`0xc04b`/`0xc04c`/`0xc04d`, the same Gen1 default addresses `apps/web/src/ui/demoGen1.ts`
  already uses for this routine) as three EXTRA OPERANDS on that instruction's own
  `CALL` trace event, widening it from `ARGC=02` to `ARGC=05`.
- **`0xE804` "advance animated picture"** (**69** combined occurrences, 24 CoK + 45 DoK) — the retail routine calls
  `NextFrame()`, whose body is `curFrame++; if (curFrame > numFrames) curFrame = 1;`. This VM does
  not track a loaded picture's `numFrames` (`PICTURE` is still one of `op_script_effect`'s
  placeholder-recorded opcodes — a separate, already-documented gap), so the wrap-to-1 half is
  **not** modeled. What is reproduced: the unconditional half, a persistent frame counter that
  increments by exactly one per `CALL` and is surfaced as one EXTRA OPERAND on that
  instruction's own `CALL` trace event, widening it from `ARGC=02` to `ARGC=03`.

The other five named ids (`SetupDuel` x2, contextual sound, `MovePositionForward`, refresh
outdoor wall type) are **unchanged** and still fall through to the original vacuous tail —
grounding them would need combat-duel, sound-channel, and outdoor-wall-type state this VM does
not own, and was deliberately left undone rather than guessed at.

**This does NOT move the 20.4% figure.** CALL was already counted as "applied" by that metric
(it has its own handler, `op_call`, distinct from the `op_script_effect` placeholder recorder —
the metric's placeholder/applied split is a handler-identity check, not a semantic one), so
fixing its internal vacuity changes `op_call_vacuous_dispatch_finding.diverges` from `false` to
`true` without moving `applied_vs_recorded_combined` at all: still 21,357 applied / 5,458
recorded-only / 26,815 total, re-measured after the fix. (Those three numbers are the
2026-09-09 frame and are kept as the control this paragraph's claim rests on -- the claim is
that THIS fix moved nothing, and it is only demonstrable against the totals as they stood when
the fix landed. The 2026-09-10 `0x41` port moved them for an unrelated reason, to 21,983 /
5,749 / 27,821; that is a different intervention and does not weaken the "no movement" result
recorded here.) Full writeup, the exact grounding
citations, and the regenerated verdict:
`../docs/engine/research/ecl-host-call-coverage.md`. Standing check:
`../tools/test_ecl_host_call_coverage.py::test_op_call_routine_id_dispatch_genuinely_diverges_for_grounded_ids`
(formerly a `pytest.mark.xfail(strict=True)` pin of exactly this gap, opened and closed the same
day — closing it turned the old pin into an XPASS, which `strict=True` converts into a hard
suite failure, confirmed by actually running the suite before editing the pin).

`ccecl.com` size against the 65,280-byte `.COM` segment ceiling: 22,634 → 22,788 bytes emitted
on disk (+154), 64,253 → 64,417 bytes resident (+164), leaving 863 bytes of headroom. (An
earlier revision of this paragraph read "64,253 → 64,455 (+202) … 22,828 emitted". Those were
the figures for the superseded append-a-second-event design described below; the shipped
extend-the-existing-event design is 40 bytes smaller emitted. Both numbers were real
measurements — they simply measured different code.)

Those are the historical measurements for that change. The current 2026-09-12 build is
18,012 bytes emitted, 63,263 bytes resident, with 2,017 bytes of headroom after the later
decode-buffer serialization change (`f7bf040`).

**Self-found defect, and the SECOND fix for it is the one that shipped — the first fix treated
a symptom.** The original working version appended each grounded id's data as a SEPARATE,
separately-tagged trace event alongside the generic `0x2D` `CALL` event already written for the
same instruction. Two problems followed from that, and only the second one was fatal:

1. *The symptom.* Tagging those extra events with the real routine ids (`0xAE11`, `0xE804`)
   collided with `ccefx.asm`'s human-readable GBSX/GBEF dump. `print_opcode_name` (a file
   outside this item's ownership, read-only) inspects only the LOW BYTE of the stored opcode
   word against a table of real ECL mnemonics covering values up to `0x40`, and `0xAE11`'s low
   byte `0x11` exactly aliases real opcode `0x11` `PRINT`. Confirmed by running
   `gbcoab-flow-test.ps1` standalone (that script's own red run ENDED on 2026-09-10; this item is
   about the dump aliasing, not its verdict) and reading `build/_GBECL.TXT`: the redraw-pose event
   printed as `OP=11 PRINT ARGC=03 ARGS= 000F 0005 0003`, silently impersonating an unrelated
   opcode even though the underlying 20-byte record was correct. That was patched by moving the
   tags to `0x80AE`/`0x80E8`, outside the renderer's checked range. (`0xE804`'s low byte `0x04`
   is NOT in that table, so it was never a confirmed collision — the disjoint convention was
   applied to it for consistency, and this sentence says so rather than implying both were
   proven.) `gbcoab-flow-test.ps1` was red at the 2026-09-10 measurement; it
   passed end-to-end in the 2026-10-03 sweep after its GBPR v2 contract was
   corrected. Running it standalone is how the collision was observed, not a
   claim about its then-current full-flow verdict.
2. *The actual defect.* Appending a second event for one instruction broke the trace's
   **one-instruction-one-event invariant**. `GBSX count` stopped counting executed
   instructions, and every `#NN OP=` index pin downstream of a `CALL` shifted by one. The
   tag-collision patch did nothing about this, because the collision was never the cause.

**The shipped fix removes the extra events entirely.** `extend_call_event_redraw` and
`extend_call_event_picture` now attach their data as EXTRA OPERANDS on the `CALL` event
`record_call_event` already wrote for that same instruction — widening it from `ARGC=02` to
`ARGC=05` (x, y, facing) and `ARGC=03` (frame counter) respectively. `record_call_event`
publishes the byte offset of the record it wrote in `call_event_slot`, or `0FFFFh` when the
trace was already at `SCRIPTCAP` and it wrote nothing, so the extend routines cannot corrupt a
neighbouring event. Three consequences, all verified rather than assumed:

- Every `GBSX count` and `#NN OP=` pin in the flow suite is stable again.
- No `ccefx.asm` change is needed and the tag workaround is gone: the tag stays the real opcode
  `0x2D`, and that file's `.call` detail formatter guards its two fields with `jb` (argc>=1
  prints the operand, argc>=2 the routine id), so `ARGC=05` still renders
  `CALL=operand:XXXX routine:YYYY` unchanged, with the extra words in the generic `ARGS` list.
  `SCRIPT_ARGS` is 8 (`src/ccefx.asm:21`), so five operands sit well inside the 20-byte record.
- The data surfaced is identical. Nothing was dropped to buy the invariant back.

**What the append design cost, stated as a REGRESSION rather than as a needle-text change.**
An earlier revision of this section reported that `gbcoab-flow-test.ps1` was "still red both
before and after … Same overall verdict (FAIL before and after), non-regressive". The
file-level verdict was indeed FAIL both times, and that is exactly why the framing was wrong.
Before the item, the script cleared its `/A 5 /B 50` stage and failed later, at the `/B 51`
stage's `GBSX count=0010` (the value pinned there at that time; re-pinned to
`GBSX count=0037` on 2026-09-10, see the retraction at the end of this section). After the
append design, it failed at `GBSX count=0007` — a needle
in the FIRST stage, which had been passing. Assertions that passed stopped passing; the run
got shorter (4.12 s to first throw). That is a regression, and a whole-file PASS/FAIL verdict
is structurally incapable of expressing it — the same lesson `../docs/engine/PLAN-ROUND-37.md`
C3 records as "'was this test ever capable of passing?' is a PER-ASSERTION question, not a
per-file one". Read the two together: a file already red is the easiest place in the repo to
hide a regression, because the only number anyone quotes cannot move. To say the live half plainly rather
than leaving it inside a quoted retraction: `gbcoab-flow-test.ps1` was red at the
2026-09-10 measurement and passed end-to-end in the 2026-10-03 sweep. This passage is about
which assertion inside it moved; the file-level verdict never was the thing under discussion.

`gbcoab-flow-test.ps1` was red at the 2026-09-10 measurement on its own `/B 51`
effect-dump pin; it passed end-to-end in the 2026-10-03 sweep after its GBPR v2 contract was
corrected. (This sentence read `remains red` until
the flow-status disclosure checker was armed on 2026-09-10 and did not recognise that
phrasing. The wording is not decoration: the checker holds every passage narrating a FAIL
script to a dated, live disclosure, and a synonym it does not know is indistinguishable
from no disclosure at all.)
**The pin's VALUE in that sentence was retracted 2026-09-10 (`f05f57b`); its VERDICT was
not.** The sentence above named that pin `GBSX count=0010` until 2026-09-10, and that value
was wrong in a way no reader of it could see. `GBSX count=` is a SATURATING counter:
At that revision `fx_script_count` in `src/ccecl.asm` was only ever `inc`'d behind
`cmp ax, SCRIPTCAP` / `jae`, and `dump_gbsx` in `src/ccefx.asm` validated rather than
clamped, so the printed number was `min(real_events, SCRIPTCAP)` and truncation was silent.
`SCRIPTCAP` has gone 16 -> 32 -> 64 (`src/ccecl.asm` now reads `SCRIPTCAP equ 64`), so the
`0010` (16) authored 2026-07-15 was a count clamped at the then-ceiling, not an event total.
`f05f57b` re-measured this case in DOSBox and re-pinned it to `GBSX count=0037` -- 55 retained
ECL script records, which REPRODUCES the 55 this README already records for the same `/B 51`
Dracandros block further down, rather than establishing it independently. What did NOT change
is the verdict: `native/flow-status.json` was measured at `repo_head 9562b8f`, before
`f05f57b` landed, so the artifact still records this script FAIL on the superseded `0010`
needle and no sweep has been run since the re-pin. Nothing here is evidence that the script
runs clean end to end, and the sentence above stands as written on that point.

**Current capacity behavior (2026-09-13):** CCECL now stops before decoding a
recordable 65th instruction, writes `GBHD reason=0007` with that opcode and PC,
and preserves the normal VM state in the fixed v9 GBEF record. CCEFX names this
as `script-effect-capacity`. Thus a saturated `GBSX count=0040` remains only a
lower bound on source effects, but the interpreter no longer silently executes
and loses the effect beyond it. `GBHD reason=0009` separately names local or
`ON_GOSUB` call-stack exhaustion: the 33rd call halts before its old
fall-through branch can mutate state.

## Why asm, and what we're modelling it on

`C:\LLM\cc` ("Claude Commander") is the reference NASM DOS project: it proves the
toolchain, a modular `mod/*.inc` + `%ifdef FEAT_*` structure, data-driven dispatch
tables, and — most usefully — a **headless test harness** (`/D` screen dump, `/T`
scripted keystrokes, `/S` snapshot→PNG) that lets us regression-test deterministically
**without** vision/Ollama. We copy its structure and test discipline.

The one thing we do **not** copy is its memory model: `cc` is a flat single-segment
`.COM` in text mode. A Gold Box engine needs **VGA mode 13h** (a ~64 KB framebuffer
alone), **multi-megabyte assets** (DAX/HLIB streamed from disk), and far calls /
overlays (DQK shipped as RTLink overlays; CoK/DoK use FBOV/INT 3Fh far-call overlays).
So the engine is a **large-model, multi-segment MZ `.EXE`**.

## Toolchain

| Tool | Role | Where |
|------|------|-------|
| **NASM** | assembler, current targets use `-f bin` → `.COM` | `{local-user-profile}\AppData\Local\bin\NASM\nasm.exe` |
| **wlink** (Open Watcom) | future linker path for large-model MZ `.EXE` targets | install: `winget install --id OpenWatcom.OpenWatcom -e` |
| **DOSBox / DOSBox-X** | run/test target | (bundled copy in `C:\LLM\cc\dosbox-x`) |

## Build

```powershell
cd native
.\build.ps1            # nasm -f bin  ->  build\pixel.com
.\build.ps1 -Target engine  # GBBOOT plus CCECL/CCEFX/CCGEO/CCFP/CCHLIB/CCCOMBAT
.\build.ps1 -Target all     # every native .COM tool
.\build.ps1 -Run      # build, then run under no-focus/headless DOSBox
.\build.ps1 -Run -Visible  # debug with a normal DOSBox window
```

`build.ps1` enforces the DOS `.COM` resident segment ceiling (65,280 bytes)
from NASM listings and warns above 60,000 bytes. `CCFP.COM` keeps its large
scratch buffers in un-emitted `absolute` reservations and overlaps mutually
exclusive transient work areas, so it stays small on disk and below the
single-segment warning threshold while still using a flat `.COM` model. Its
`/T` table builder stores the decoded source 8X8D tiles in high scratch memory
and keeps only the final deduped tile pool resident for rendering; this preserves
the verified CoK/DoK texture capacity without spending source-tile cache space
inside the `.COM` segment. The high-scratch source cache is guarded separately
from the resident pool because real DoK area 1 decodes 346 source tiles before
dedupe.

**Current generated capacity:** CCECL emits 24,854 bytes and occupies 65,215
resident bytes. `build.ps1` writes those per-tool
measurements and a hash of the complete native source tree to
`native/build/native-capacity.json`; the capacity gate rebuilds before accepting
this claim.
<!-- native-capacity:ccecl emitted=24854 resident=65215 headroom=65 -->

Explicit Secret source selection uses the original DOS ECL opcode08 RANDOM
recurrence and byte range, including saturation at255 and full32-bit seed
carry. It emits paired GBRS flags12/13; old Secret4/5 and incomplete/future
revisions fail before continuation answers are read. Legacy generic0/1 and
exact CoK state rules retain their own admission. Secret SURPRISE and combat
dice keep their established behavior. Complete original-handler evidence,
compiled range/seed/alias controls and the per-reader compatibility boundary
are recorded in [the RANDOM contract](../docs/engine/research/secret-random-contract.md)
and [the state compatibility contract](../docs/engine/research/secret-rng-state-compatibility-contract.md).

## DQK LOAD_FILES context regression

The 2026-10-02 fix checks the `FF` sentinel before storing tagged CA03 state.
The complete `ccecl-effects-test.ps1` passes its 24-case HLIB/GLIB, reset,
replacement, NEWECL and Gen1/DoK matrix. `ccecl-menu-resume-test.ps1` now passes
its complete gate, including eight cold context cases with real CCMENU v2
tokens, numeric input, WHO, string input, PARTY_SURPRISE and retail branches.
Context preservation does not establish terrain rendering.

Current sweep: `ccecl-dqk-combat-test.ps1` is PASS (2026-10-02), at
`2c0bd069`: both monster attack profiles reproduce the 48-row queued and
natural encounter traces, with LCG offset 12 and exact GBCR/resume checks.

## Menu input and identity regression

CCMENU reads INPUT_NUMBER's destination from operand two and requires count
zero for an unsigned 16-bit answer. CCFP enforces the same count rule.
Both interactive readers reserve room for five digits and the terminating
Enter in the DOS input buffer. Their typed-input controls cover zero, 1234,
65535, and rejection of 65536 followed by a valid zero response.
Both complete menu harnesses pass these controls with exact GBMO identities
and unchanged pending effects and CCFP sidecars.
CCMENU and CCECL bind the pending PC/area to GBRS and destination/opcode to
GBMN before publishing or accepting a token. Matching an inconsistent MN_ID
tail is insufficient to authorize a resume.

The complete `ccmenu-test.ps1` passes numeric 0/750/65535 and rejects count
one, text padding, overflow and all four identity mismatches in both v14 and
v15. The complete `ccecl-menu-resume-test.ps1` also passes eight matched-token
identity mutations across genuine v14 numeric and v15 WHO producer records.
Rejection preserves source/pending/token bytes and emits no output; positive
resumes consume their one-shot tokens. These are component results, separate
from the dated flow sweep below.

The complete `ccfp-effects-test.ps1` passes a CCFLOW-produced Gen2 numeric
prompt with a 65-event sidecar. Guest BIOS input advances the page and submits
750; CCFP publishes the exact GBMO v2 identity. A count-one clone, given
answer zero, rejects without a token. Both cases preserve the pending effect
and sidecar bytes. The existing wall, movement and image controls also pass.

## DoK ACK continuation regression

The v15 acknowledgement readers bind the pending identity to its stored
resume PC. The former fixed value 223 admitted one retail prompt and rejected
the real area-34 prompt at PC 151. CCECL separately checks the PC against the
loaded ECL block before consuming the one-shot answer; GBBOOT retains its
exact source-archive verification through CCBIND.

`native/ccecl-ack-resume-test.ps1` exercises direct retail `ECL1.DAX` blocks
34 and 16 through CCFLOW, CCFP and a cold CCECL process. The no-party direct
routes resume from PC 151 to 201 and from PC 223 to 328, respectively. It
checks raw comparison flags, unchanged input effects/sidecars, exact GBMO
identity, consumed-token retries, mismatched identities, and PC bounds.
It queues one P key through the guest BIOS in a hidden DOSBox session.
`tools/test_native_ack_resume.py` runs this component regression in the
standing corpus. A separate hidden DOSBox-X GameLink run on 2026-10-02
started `GBBOOT /E /X /J /R DOK_INTRO C` with no `_GB*` files, observed the
Cekos guard prompt at PC 151, then sent one GameLink P action. It resumed to v9/status 0 at
area 34/PC 201 and produced a nonblank 320x200 snapshot. Both source identity
payloads matched the unchanged ECL archive. The P action also repeated into
the command shell after return, so it is not evidence of single-key delivery.
This was an input-driven check;
the unattended intro/playable/create/flow scripts still time out awaiting ACK.

## Secret Amiga player session

For the supported Secret Amiga data route, supply the held `DISK1`/`DISK2`
data root and a DOS Secret directory containing `CHRDATA1.SAV` through
`CHRDATA6.SAV` and their existing STF/SFX companions:

```powershell
./native/run-goldbox.ps1 -Profile SecretAmiga -GamePath '<Amiga data root>' -SecretDosPath '<DOS Secret root>'
./native/run-goldbox.ps1 -Profile SecretAmiga -GamePath '<Amiga data root>' -SecretDosPath '<DOS Secret root>' -Resume
```

This explicit route imports the supported DOS pregens through native CCPARTY;
it does not restore an arbitrary original saved party. Its private session is
bound to both canonical source roots and copies the six required Amiga data
files and supported actor companions once. Completed snapshots are reused
without refreshing retail inputs or current party state. C: stays in the
session's `GREYBOX`, and D: starts in `DISK2`. Fresh entry uses
`/E /! /A16 /9 1`; strict Resume uses `/5 /! /A16 /9 1` and requires an existing
complete session with a GSK/GKB/GKT candidate. Native CCNEXT validates that
candidate. `-PrepareOnly` returns both mounts, the generated config/batch and
native completion/failure marker paths. The batch records native nonzero
failure as `LAUNCH.BAD` and keeps its DOS message visible; a DOSBox process
exit alone proves no successful continuation. `-PartyMenu` is unavailable for
this route. The config calls the short DOS filename `C:\RUNGB.BAT`.
Ordinary `-Profile Secret` remains the DOS-DAX route with its
existing unsupported Resume behavior. This is a bounded owned-session front
door, not complete campaign or Amiga executable parity.

INITIAL recovery also checks the entire current P1 against its frozen owned
roster before probing an answer or publishing READY. A foreign, absent,
truncated or extra party file fails without restoring inputs or consuming a
token. This uses the established CCNEXT cursor admission; it does not overwrite
a changed party from the checkpoint. That task248 repair added7 emitted bytes
only to CCNEXT. Current task249 measurements are listed above; the INITIAL
admission policy remains unchanged.

## Interactive CoK launcher

From the repository root, run `./native/run-cok.ps1` to build the native engine
and open a visible DOSBox session with the local `Champions of Krynn` data
mounted. It runs `GBBOOT /E` rather than a snapshot test: after title and party
screens, use arrow keys for the bounded first-person route, `G` to switch the
available graphics set, and `Esc` to leave the view. Greybox state is written
to a persistent player session; the launcher does not replace the retail CoK
executable.

Press **C** to enter camp and **S** to save. On a later launch, use
`./native/run-cok.ps1 -Resume` to restore that camp from the persistent player
session's `GREYBOX.GBS`. Sessions live under `native/player-sessions/`, are
keyed by the complete source path, and are copied only on first launch: retail
assets and the separate test mirror under `native/build/_retail/` are never
refreshed into a player session. Pass `-SessionRoot <path>` to choose another
player-data location. A new session opens the native `[B]egin/[C]reate` gate:
create one or more characters with `C`, then press `B` to begin. Existing
imported and native-created GBPR rosters are reloaded through that same path.
`-Resume` and `-PartyMenu` are mutually exclusive; a missing checkpoint is
reported before building or opening DOSBox. Interactive output stays in the
DOS window so the camp menu remains visible.

The launcher mounts a `GREYBOX` runtime inside that player session as C:, then
mounts the session snapshot as D:. It copies only freshly built `.COM` and
`.GBM` files into C:, so helper state cannot race `native/build` fixtures and
all other session files persist. `-PrepareOnly` creates those mounts and writes
the DOSBox configuration without opening a window; it is used by the launcher
regression test.

The normal launcher uses the native `[B]egin/[C]reate` gate and never injects a
synthetic `GREY_*` party. `-PartyMenu` remains a compatibility spelling for the
same interactive route. CoK's text-mode `[P]lay [D]emo` selector starts the
native party route or the pinned `ECL2.DAX#57`/`GEO2#64` demo boundary; the
bounded demo probe does not mutate campaign state. Normal launch passes
GBBOOT's `/!` interactive-menu flag, so an ECL menu yield is offered through
CCMENU instead of silently using a test seed.

## Profile-resolving private launcher

`./native/run-goldbox.ps1 -GamePath <directory>` creates or reopens a private
player session for CoK, DoK, Pool of Radiance, Curse of the Azure Bonds, Secret
of the Silver Blades, Gateway to the Savage Frontier, Treasures of the Savage
Frontier, Pools of Darkness, Neverwinter Nights, Buck Rogers: Countdown to
Doomsday, Matrix Cubed, DQK, or FRUA. It validates each title's marker plus the
event/map files used by the native route before copying any user-owned file,
then mounts the persistent session as D: and its `GREYBOX` runtime as C:.

It accepts direct installs; every packaged title folder at the source root
(`COK`, `DOK`, `POOLRAD`, `CURSE`, `SECRET`, `GATEWAY`, `TREASURE`, `DARKNESS`,
`NWN`, `BUCK`, `MATRIX`, `DQK`, or `FRUA`); and the corresponding
`GAME\\<folder>` layouts. It also retains direct files beneath `GAME` for
existing single-title releases. `-PrepareOnly`
returns the resolved profile and paths without opening DOSBox; `-Resume` and
`-PartyMenu` retain the same `/!` interactive routes as the CoK launcher.

The launcher deliberately accepts only the layouts it can identify from their
required data. An unknown or ambiguous directory fails before a session snapshot
is created. Player state and runtime sidecars persist across later preparations.
A single-title source retains its established `GREYBOX` C: runtime; a library
with multiple resolved titles receives a `GREYBOX\\<profile>` runtime for each
selection. Source files are never refreshed into an established session. The runner
selects a safe front door for these profiles; it does not imply full campaign
coverage for any title.
## Native boot front door: GBBOOT

`src/gbboot.asm` (`build\gbboot.com`) is the first DOS-native engine boot
slice. Run it from a mounted Gold Box game directory, or run `C:\GBBOOT` while
another drive is current, and it detects the local layout before launching the
right executable. It also auto-enters the common re-release wrapper folders
(`GAME\POOLRAD`, `GAME\CURSE`, `GAME\SECRET`, `GAME\DARKNESS`,
`GAME\GATEWAY`, `GAME\TREASURE`, `GAME\BUCK`, `GAME\MATRIX`, direct `GAME`
folders containing the DOS files for those same DAX profiles, and a generic
`GAME` folder when it contains DQK's `DISK3\ECL.GLB`/`GEO.GLB` data, with or
without `DQK.EXE`, FRUA's root `CKIT.EXE` plus either `SCRIPT.GLB` or
installed `DISK3\GEO.GLB`, or a native-only `GEO.GLB` HLIB dump) before
detection, so mounting the game root
from the Steam/GOG-style release works without manually changing directory. For the named broader Gen1 wrappers,
`GBBOOT` can also enter the child when the original executable is absent but
the child has the verified profile marker plus `GEO*.DAX`, preserving the
native-only data profile instead of falling back to generic Gen1.

```
GBBOOT       ; detect and EXEC the game
GBBOOT /D    ; dry-run only: print detected game/engine/executable
GBBOOT /E    ; native ASM preview: CCECL+CCGEO+CCFP or CCECL+CCCOMBAT
GBBOOT /E /X ; native ASM preview snapshot: write _GBVIEW.RAW/_GBCOMB.RAW and exit
GBBOOT /E /X /J ; play/decode verified title art, then snapshot and exit
GBBOOT /E /A 2 ; native preview area/map override
GBBOOT /E /A 1 /B 34 ; experimental Gen1/HLIB ECL entry override
GBBOOT /E /X /A 1 /B 36 /@ 33090 ; direct CCECL entry probe for a real DoK tactical handoff
GBBOOT /E /X /A 2 /B 51 /1 29 /0 19689 1 ; seeded DoK vmRun1 queued tactical handoff
GBBOOT /D /G 2       ; request Amiga graphics and report native fallback status
GBBOOT /E /X /R BOOT_CLERIC C /R BOOT_FIGHTER F /R BOOT_MAGE M
                              ; create native members, refresh GBPS, and continue headlessly
GBBOOT /E /I 31 /F 12 /M 4 /M 10 /K 42 /S 22 /P 2 /H 1 /L 77 /C 1 /Y 2 /O 2 /W 3 /Q 3 ; pass CCECL seeds
GBBOOT /E /X /C G  ; pass a headless tactical command script to CCCOMBAT
```

Gold Box combat is not part of the first-person dungeon renderer. The native
path keeps the same boundary: `CCECL` runs exploration/search ECL until a
scripted encounter yields a `GBEF` combat record, `GBBOOT` launches the separate
`CCCOMBAT` tactical engine for initiative, grid positions, movement, attacks,
flee/guard, and outcome, then `CCECL /R` resumes the saved ECL continuation.
Both ordinary `/R` continuations and `/P` persistent-state imports accept only
their documented exact `GBEF` version and byte length (v3–v9, with each
append-only layout checked separately); future versions and trailing bytes fail
before VM state is restored or a new effect is written. Interactive menu v14
records remain a separately validated contract.
When the status below says a title is verified through exploration only, that
does not imply its natural dungeon-step path has reached a tactical battle.

### Native graphics-set contract

GBBoot owns presentation selection independently from game logic, ECL state, and
save data. `/G 0` selects automatic presentation, `/G 1` requests DOS,
`/G 2` requests Amiga, and `/G 3` requests C64. Every boot plan prints both the
requested and effective set so fallback is visible rather than silent.

The first rendered native slice probes
`8X8D1.DAA`, `DISK2\8X8D1.DAA`, and `GAME\8X8D1.DAA` for an Amiga request and
distinguishes available assets from missing assets. `/G 2` runs sibling
`CCDAA.COM`, emits logical blocks 203 and 202 as `_GBAMIGA.GBT` and
`_GBAMIG2.GBT`, and passes that bounded resource set to CCFP. CoK's compact
archive uses TOC entries 2/1; DoK's five-plane wide-frame archive uses entries
29/28 for those same logical boot/frame blocks. This is deliberately
profile-owned: the nearby DoK entries 2/1 are wall-bank chunks 41/21 and must
not be presented as complete wall sets. CCFP validates each version, block id,
geometry, palette cardinality, and file length before resolving it; a missing,
malformed, or nonmatching resource falls back to the DOS DAX block. C64 wall data
is still unavailable: its WALLDEF layout is not solved. Solved C64 `PIC*`
narrative art now has a bounded import path instead:
`python tools/c64_native_scene.py --disk <user-side.d64> --picture PIC70 --block 112 --out C64SCENE.GBI`
emits CCFP's self-contained GBIM v1 resource. Place it beside the mounted game
assets and request `/G 3`: GBBOOT activates it only when its GBIM block id
matches the ECL `PICTURE` record, then retains DOS walls as the fallback.
`CCFP ... /K C64SCENE.GBI /O` remains available for direct scene inspection.
This is not yet a C64 first-person wall set. The graphics choice remains outside
ECL and save state. In CCFP's `/W` loop, `G` switches between the retained GBTS
resource and DOS fallback, rebuilds only presentation tables and the DAC, and
redraws without changing map position, facing, or ECL state. `/J` performs the
same toggle once before a snapshot for deterministic headless verification.
While walking, **Enter** cycles the populated retained GBSX inline-text records
in the bottom message band. This is deliberately bounded capture presentation:
each record is still at most 32 bytes, and source-faithful print ordering and
clear-box semantics remain native-engine work.

**Per-category `/G` status, re-derived 2026-09-05 (round 36).** The line that stood
here -- "Amiga scene/sprite categories beyond this first wall-resource set remain next"
-- was written 2026-07-15 in `23ba4970` and falsified ten days later by the
scene bridge (`198212d`, `3962d62`, `51bc7d5`, `0056fc3`, all 2026-07-25). This file
was edited again on 2026-08-21 (`14c8e08`) without revisiting it, and on 2026-09-05
an integrator read it, believed it, and wrote "the graphics switch covers ONE
resource category" into the project's `CLAUDE.md`. The table below is now derived
from the gate conditions in `src/gbboot.asm` by
`tools/test_native_graphics_prose.py`, which fails when the two disagree, so
promoting or demoting a category in code forces this prose to move with it.

| Resource category | Routine that owns the `/G` decision | Gate state |
| --- | --- | --- |
| Wall/tile bank, logical blocks 203/202 (`8X8D*`) | `prepare_alt_graphics` | `dos-fallback` |
| Pre-combat scene/picture art (`BIGPIC*`, `PIC2/4/5`, `HEAD2`+`BODY2`) | `present_precombat_pictures` | `no-gate` |
| Tactical combat icons (`CPIC1`) | `prepare_combat_graphics` | `dos-fallback` |

`dos-fallback` means the routine tests `graphics_requested == 2` and, when the
answer is no, continues into a DOS decode instead of returning. `no-gate` means it
does not test the requested set at all and the platform choice is made downstream in
`prepare_alt_graphics`. `amiga-only` -- the state the stale line described, and the
state both the scene and the combat-icon categories were still in at `50b4444` --
means the routine returns without doing its work unless Amiga was both requested and
located.

State the remaining limits rather than rounding that table up to "done". Both DOS
sides are Gen1 DAX paths: in the non-demo frame `present_precombat_pictures`
requires `eng_dax_gen1` plus a GEO and a located texture bank, and
`prepare_combat_graphics`'s DOS branch requires `eng_dax_gen1` before
`find_dos_cpic`, so HLIB/Gen2 titles reach neither. No standalone sprite or portrait
bank (`SPRIT`, `CBODY`, `PICA`-class art) is on `/G` at all. `/G 3` selects a supplied,
matching C64 `PIC*` GBIM only for narrative scenes; without one it reports the C64 decoder
unavailable, and C64 walls and combat icons remain unavailable. CCFP's `G` key toggles the three
retained resources together -- `graphics_alt_enabled`, `gbim_enabled` and
`scene_enabled` -- rather than the wall bank alone.

**`CCFP /L` was a dead option and is now RETIRED (round 37 R3, 2026-09-05).** It was supposed to
bound a headless scene replay. It did not: standalone CCFP on identical artifacts gave `/O /L`
killed at 30.12 s, `/O` killed at 30.03 s, and `/O /S <raw>` exiting in 1.04 s, i.e. `/L` and
no-`/L` were indistinguishable. The reason was structural -- CCFP reads `automode` at exactly one
site, reachable only when `/F` has set `gbwfpmode`, and `.replay_scene` jumps over the only branch
that appends `/F`. Round 36 fixed the resulting non-termination by making GBBOOT's
`scene_replay_force=1 / snapflag=0` arm append `/S <path>` instead; `.timed_scene` and the `' /L'`
string are deleted from `gbboot.asm`.

**Round 37 then removed the flag itself.** The parse branch is gone, `[/L]` is gone from `s_usage`,
and `.gbws_wait`'s `[automode]` branch is annotated as permanently dead. Note precisely what is and
is not dead: `.gbws_wait` **remains a live jump target** (`je .gbws_wait`) for the wall-set-bundle
path; only the `[automode]` branch inside it is unreachable. `ccfp.com` went 16711 -> 16698 bytes
and the budget closes exactly -- 9 bytes for the removed `cmp`/`jne`/`mov`, 4 for the shorter usage
string. Equivalence was measured in **both** builds against the flag's own absence: `/O /L` vs `/O`
was 8.08 vs 8.02 s before the edit and 8.10 vs 8.09 s after, and `/S` still exits (0.88 s before,
0.91 s after). Nothing in the repo emits `/L` to CCFP. (The interactive arm still waits for a
keypress; that is correct -- there a human is the exit.)

**This paragraph is why round 38 owes a doc-freshness guard.** Until 2026-09-05 it ended "**But
`ccfp.asm:5287` still lists `[/L]` in its usage string** ... Removing it, or giving it an
implementation, is unowned work." R3's agent read exactly this paragraph, confirmed it was accurate,
and recorded that as a small win -- this project's usual failure is trusting a *stale* doc, and here
a *current* one had gone unconsulted. Then it retired the flag and left this paragraph unedited, so
the passage that celebrated reading a current document made that document stale within the same
session. `CLAUDE.md` carried the same claim and needed the same correction.

Current boot profiles cover:

- Champions of Krynn: `START.EXE` + `KRYNN.CFG` + Gen1 DAX signatures, or
  native-only `KRYNN.CFG` + `ECL1.DAX` + `GEO1.DAX` data.
- Death Knights of Krynn: `START.EXE` + `DKK.CFG` + Gen1 DAX signatures, or
  native-only `DKK.CFG` + `ECL1.DAX` + `GEO1.DAX` data.
- Pool of Radiance: `START.EXE` + `POOL.CFG`.
- Curse of the Azure Bonds: `START.EXE` + `CURSE.CFG`.
- Curse/CoAB data-only dumps: `ECL1.DAX` + `ECL2.DAX` + `GEO2.DAX` +
  `8X8D1.DAX` + `8X8D2.DAX` + `WALLDEF2.DAX` (native `/E` only).
- Secret of the Silver Blades: `START.EXE` + `BLADES.CFG`.
- Gateway to the Savage Frontier: `GAME.EXE UseStart` + `GAME.CFG` + `ZOUNDS.DAX`.
- Neverwinter Nights (DOS/AOL): `GAME.EXE` + `GAME.CFG` + `GAME.OVR` +
  `ECL0.DAX` + `GEO0.DAX`; native `/E` starts at `ECL0/GEO0`, with `/A 1..3`
  selecting the observed `ECL1/GEO1`, `ECL2/GEO2`, and `ECL3/GEO3` starts.
- Treasures of the Savage Frontier: `GAME.EXE` + `TREASURE.CFG` + `ZOUNDS.DAX`.
- Pools of Darkness: `GAME.EXE` + `POOL4.CFG` + `GAME.OVR`.
- Buck Rogers: Countdown to Doomsday: `BUCK1.EXE` + `BUCK2.EXE` + `BUCK3.EXE`.
- Buck Rogers: Matrix Cubed: `START.EXE` + `MATRIX.CFG`.
- DQK and generated CoK/DoK-on-DQK builds: either `DQK.EXE` +
  `DISK*\*.GLB/TLB`, the same original disk layout under `GAME\`,
  native-only `DISK3\ECL.GLB` + `DISK3\GEO.GLB` data, flat `DQK.EXE` +
  `ECL.GLB`/`GEO.GLB`/`8X8D*.TLB`, or native-only flat `ECL.GLB` +
  `GEO.GLB` data.
- Generic Gen1 fallback: `START.EXE` + at least one `.DAX` archive.
- Named broader Gen1 data-only folders: Pool, Curse, Secret, Gateway,
  Neverwinter Nights (DOS/AOL), Treasures, Pools of Darkness, and Matrix Cubed profile markers plus
  `GEO*.DAX` data keep their game name and run native `/E`, while still
  refusing plain chainload. When `ECL1.DAX` and `GEO1.DAX` are both present,
  Pool, Secret, Gateway, Treasures, Pools of Darkness, and Matrix Cubed take the
  same ECL-backed area-1 native path as their executable profiles; otherwise
  they use the conservative raw-map preview.
- Generic Gen1 data-only DAX dumps: any `GEO1.DAX`..`GEO8.DAX` archive
  (native `/E` raw-map preview only).
- FRUA fallback: `CKIT.EXE` plus root `SCRIPT.GLB`, or the installed release's
  `DISK3\GEO.GLB`, identifies the client and retains normal CKIT chainload.
  The retail `DISK3\SCRIPT.GLB` is FRUA's event-page library and its
  `DISK3\GEO.GLB` members are `FORM`/`AMOD` data, neither the
  verified/generated HLIB ECL container or DQK raw map accepted by the native
  preview paths. `CCGEO` does directly normalize a user-selected `.DSN`
  `GEOxxx.DAT` `FORM`/`AMOD` map through its documented six-byte grid into a
  WGRD bridge; for example,
  `CCGEO /B HEIRS.DSN\GEO005.DAT 0 C:\FRUA.WGR`. The source map is map 0
  because one direct design file holds one map. This is not yet a GBBOOT FRUA
  play route: selection of an arbitrary design/start module and its event-page
  semantics still require their own native contracts.
- Generic HLIB/GLB data-only dumps: `GEO.GLB`, including `GAME\GEO.GLB`
  wrapper roots, with optional flat `ECL.GLB` promoted to the native Gen2
  ECL/GEO preview path.

The non-Krynn markers mirror the evidence already used by the TypeScript game
detector and documented in `docs/engine/research/broader-roster-detection.md`;
where a real local install is not present, `native\gbboot-test.ps1` verifies the
ASM detector with synthetic marker-only DOSBox fixtures.

`/E` is the first non-chainload engine path. Gen1 DAX profiles with
`TITLE.DAX` can now begin this path through the bounded title helper; the local
CoK, DoK, and Curse/CoAB data prove that path with real full-screen
`TITLE.DAX` boot frames (SSI and title art). CoK and DoK now compose their
recovered three-screen sequences natively: full block 0, then full block 1
with each partial title band at its pixel-derived coordinate. Each frame is
bounded to about three DOS seconds and any key skips it;
for interactive CoK/DoK `/E` launches, GBBOOT now follows those frames with a
native `[P]lay [D]emo` selector. `P` continues the existing native party and
exploration route. `D` selects the recovered original script entry instead of
a synthetic demo map: CoK `ECL2.DAX#57` with `GEO2#64`, or DoK `ECL1.DAX#2`
with `GEO1#32`. Like the retail attract loop, about 30 seconds of title idle
time selects Demo automatically. `/E /X` and `/E /T` deliberately bypass the wait for deterministic
headless runs. This selector is presently text-mode; timed in-game demo
presentation remains active follow-up work.
`/E /X` bypasses the timed intro so headless snapshots remain fast and
deterministic, while `/E /X /J` forces the verified title path before the
snapshot so CI-style runs can prove intro playback without a focused DOSBox
window. When the user-owned Amiga CoK score is available, `build.ps1
-Target engine` runs `tools/smus_to_gbm.py` and emits `COKTITLE.GBM` beside the
native tools. When the local DoK Amiga extract provides `sound\krynn.smu`, the
same SMUS converter emits `DOKTITLE.GBM` and GBBOOT plays it during the first
DoK title frame. When a local DQK install provides `DISK1\PCDQ1.XMI`, the same
build runs `tools/xmi_to_gbm.py` and emits `DQKTITLE.GBM`; GBBoot plays that
optional DQK stream through CGB's bounded music-only path after `TITLE.TLB`
decode.
CCGB sequences its real main-melody pitches and packed SMUS durations through
the DOS PC speaker using BIOS ticks and PIT channel 2, and always disables the
speaker on exit. This is explicitly an Amiga-SMUS-derived PC-speaker adaptation;
CoK DOS `MIDI.DAX` note-timeline storage remains unresolved.
`gbintro-flow-test.ps1` pins the no-focus CoK version of that front door:
`GBBOOT /E /X /J /R INTRO_CLERIC C` plays bounded `TITLE.DAX` frames and title
music through CGB, creates a native member through CCPARTY, refreshes GBPS from
GBPR, and exits with a nonblank first-person snapshot. `gbcok-playable-flow-test.ps1`
pins the stronger CoK boot-to-gameplay path: `GBBOOT /E /J /T 1` plays title
frames plus music, creates a three-member native party, runs the first bounded
persistent SearchLocation event, then relaunches the same GBPR into a bounded
combat/resume event and verifies the nonblank tactical RAW frame, resulting
`GBCR` sidecar, and persisted GBPR HP writeback. It then launches once more
without `/R`, reloads that post-combat GBPR, takes a clean noncombat step,
verifies no tactical sidecars are written, confirms the roster bytes stay
unchanged, and finally runs a post-combat `/E /X /J` title/native snapshot that
reloads the same GBPR and writes a nonblank first-person RAW frame. `test.ps1
-EngineSmoke` now runs this CoK boot-to-gameplay canary plus the DoK and DQK
playable canaries, optional NWN, Curse/CoAB, DQK Amiga GLIB, Pool preview,
Secret raw-GEO plus Secret GLIB ECL/GEO, Gateway GLIB ECL/GEO, and Buck
real-data canaries, and the broader
synthetic Pool/Secret/Gateway/Treasures/POD/Buck/Matrix title/native-party
combat canary when `-FlowSmoke` is not already running the full flow set.
Current sweep: `gbintro-flow-test.ps1` is PASS (2026-10-02).
Current sweep: `gbcok-playable-flow-test.ps1` is PASS (2026-10-02).

`gbcok-demo-probe.ps1` pins the first native attract-mode boundary from the
same original CoK data the browser uses: `GBBOOT /E /X /A 2 /B 57` enters
`ECL2.DAX#57`, retains its real narration and `EXPLORE CITIES` beat, stages the
2 Green Dragons, 4 Bozak, and 6 Zombies plus the three temporary NPCs, and
renders the native 320x200 combat framebuffer. It also retains 320x200 scene
snapshots and a versioned `_GBPICS.BIN` trace for the currently bounded script
window. It is intentionally a source and combat baseline, not yet a claim that
the native title menu or full picture/city-walk presentation has been promoted.
**The 2026-09-05 `-CoreOnly -Headless` exit-1 result ended on 2026-09-11.** Re-running the
suite after it began requiring per-child verdicts produced four child PASS lines and
`RESULT: ... core suite PASS ... 4 passed, 0 skipped`. The suite now forwards `-Headless` to each
child that declares it, rather than relying on the ambient environment variable.

**Current sweep, 2026-10-04: 36 scripts, 36 PASS, 0 FAIL, 0 SKIP,
zero unclassified**, measured at `c5c89953` in [flow-status.json](flow-status.json).
The native source content hash is
`0af97365c9606b59fbfb8008c0cee3ed0531624d452cc193f9701b9eac5ef379`.
No retail file writes were observed and `native/src` stayed clean and unchanged
throughout. The separate directory-mtime probe recorded a touch of
`The Dark Queen of Krynn/DOSBOX`. Luna retained per-script `.boot`, `.err`, and
`.out` logs in `native/build/flow-status-logs/`; outer sweep log:
`{local-user-profile}\AppData\Local\Temp\GoldBox-flow-suite-final-20261004-071823.log`.
The prior two SKIPs are now measured: both combat-icon flows read held WHDLoad
fallback assets, while the scene trace captures each complete GBPI snapshot
through focusless GameLink ACK progression. Both scripts explicitly exit zero
after their measured PASS summaries so the runner records the results.

**HISTORICAL SWEEP, 2026-09-13: 35 PASS, 0 FAIL, 0 SKIP, 35 of 35 classified,
zero unclassified**, at `repo_head 574271ff` with unchanged `native/src` bytes
throughout. The five formerly optional flow scripts are now in the denominator;
`gbpool-flow-test.ps1` now passes its verified direct terminal source branch. The scene red was a trace-attribution error: the renderer
presented the complete initial `112,96,113,77,112` sequence, then a later
combat handoff replaced `_GBPICS.BIN` with the source-order suffix
`96,113,77,112`. The test now captures every distinct trace while DOSBox runs
and requires both the initial sequence and a final contiguous suffix. The two
DQK area-5 reds closed when GBBOOT began entering vmRun1 before resuming slot 3,
so the retail script itself generates `C1` and `C2`. `retail_folder_writes` is
empty; the separate directory-mtime oracle still records only the known
DQK/DOSBOX executable-owned directory touch.
Current sweep (2026-10-03): `gbpool-flow-test.ps1` PASS; raw GEO preview, ECL map bridge,
movement/combat/resume, and terminal ECL branch all completed.

**HISTORICAL REGRESSION CLOSURE, 2026-09-20: 35 PASS / 0 FAIL / 0 SKIP, 35 of 35
classified, zero unclassified**, at `repo_head 729fec49`, with committed
`native/src` bytes unchanged throughout (content hash
`f498b821042c13c4a738667c5bc603dcb391d3ed55c33d6f7116905a40366012`). This
post-CCCOMBAT-capacity run was made in a fresh E: worktree with every retail
fixture, and both retail oracles reported zero file changes and zero directory
touches.

The 2026-09-15 21-PASS/14-FAIL regression **ended** with `8caf5f4f`. A clean
bisect identified `a22f5ae5` (routing Gen1 execution through `CCFLOW`) as the
first bad commit. `CCFLOW` had inherited an unowned near-top-of-segment stack
and released both that stack and its `fxbuf` BSS when it shrank its DOS block;
a full CCECL child could therefore overwrite continuation state. The repair
installs a bounded private stack, retains code, data, effect buffer, and stack,
and bounds-checks the retained image. Focused CoK, DoK, DQK, and 65th/129th
effect continuation checks passed before the complete clean sweep. The three
per-process fixture-directory changes in `002d0bac`, `fe5cabf3`, and
`b17655dd` prevent nested learning, memorization, and inventory tests from
reusing stale directories between flows.

The flow-status checker is a standing corpus gate; it checks the committed artifact, README disclosures, source freshness, and retail-write evidence on every `pnpm test:corpus` run.
The core runner now fails before normal work if its required DOSBox executable is absent, and the
per-flow artifact records every entry as `FAIL` with `required-dosbox-unavailable`; neither runner
can convert a missing emulator into a green run or a SKIP. Direct flow diagnostics still skip before
building when DOSBox or their named retail/Amiga data is absent. `tools/test_native_flow_preconditions.py` exercises that direct-flow contract in a
temporary no-data repository and rejects a roster change that is not explicitly classified. The
remaining blocker is the probes' mutation evidence.

**The round-36 baseline, 2026-09-05: of the 27 scripts in `test.ps1`'s `$flowScripts` list,
16 PASS, 0 SKIP, 11 RED.** The eleven were `gbdqk-intro-flow-test`,
`gbdqk-playable-flow-test`, `gbdqk-create-test`, `gbdqk-multistep-flow-test`,
`ccecl-dqk-vmrun-test`, `ccecl-dqk-combat-test`, `ccecl-dok-combat-gap-test`,
`ccecl-dok-thief-matrix-test`, `gbcoab-flow-test`, `gbbroader-flow-test` and
`gbdqk-flow-test`.

**ROUND 37, same day, measured by `native/run-flow-suite.ps1` into `native/flow-status.json`:
19 PASS, 8 FAIL, 0 SKIP, 27/27 classified, zero unclassified.** The three that flipped are
`gbdqk-playable-flow-test`, `gbdqk-create-test` and `gbdqk-multistep-flow-test`; the eight still
red are `gbdqk-intro-flow-test`, `ccecl-dqk-vmrun-test`, `ccecl-dqk-combat-test`,
`ccecl-dok-combat-gap-test`, `ccecl-dok-thief-matrix-test`, `gbcoab-flow-test`,
`gbbroader-flow-test` and `gbdqk-flow-test`. **The number means something only because the
baseline was reproduced first**: the same runner re-measured 16 PASS / 0 SKIP / 11 RED, the same
eleven names, on `native/src` content hash `32d3cf22`, before any of round 37's fixes were applied.
Five full sweeps. `retail_folder_writes` was empty on every one.

**One limitation of that artifact, stated rather than buried.** All three DQK flow scripts guard on
data presence with `Write-Output "SKIP: ..."; exit 0`, so on a machine without the retail DQK
install they exit 0 like a pass. The runner does not key on the exit code alone -- it tests the
`SKIP:` line *before* the `RESULT: ... PASS` line, and SKIP wins even when a stale PASS line is also
present -- and the trio here recorded `classification_rule = exit 0-result-pass`, i.e. a real PASS
line was observed. But `skip=0` across seven sweeps means the SKIP branch has never fired on this
machine, so it is proven by direct probe of the branch logic, not end-to-end. Do not read `skip=0`
as "verified that nothing skipped".

**None of the round-36 eleven was round 36's doing** -- all eleven were re-run with
`git show HEAD:native/src/gbboot.asm` in place and failed with byte-identical messages, then
the round-36 source was restored and verified by SHA-256. **That sweep had to be run one
script per `pwsh -NoProfile -File`, because `native/test.ps1 -FlowSmoke` still aborts on its
first failure, so every script after the first red has no recorded status. **The child-result
half ended on 2026-09-11:** it now runs each script in a child `pwsh`, rejects a nonzero exit,
and counts an exit-0 `SKIP:` separately from PASS. `-SelfTestRunnerSemantics`, called by
`tools/test_native_runner_semantics.py`, proves both outcomes without DOSBox. The first-failure
limitation is why the committed `run-flow-suite.ps1` artifact remains the status source.

**Two suite defects ended on 2026-09-11.** `Invoke-Flow` now forwards `-Headless` whenever the
child declares it, requires a child PASS or SKIP verdict, and makes a core SKIP visible in the
suite summary. Its no-DOSBox self-test proves PASS, SKIP, clean no-verdict, and exit-7 controls;
the real four-core headless run recorded 4 PASS and 0 SKIP. Each core script now checks its named
data sources before build, so a missing source emits `SKIP:` rather than a hard failure. The core
flows require retail data (CoK + a generated `COKTITLE.GBM`; DoK +
`amiga_extracted\DeathKnightsOfKrynn\disk1`; DQK `DQK.EXE`, `SAVGAMA.QSV`, `DISK1\TITLE.TLB`,
`DISK2\MONCHA.GLB`, `DISK2\8X8DB.TLB`, `DISK2\8X8DC.TLB`) plus DOSBox 0.74-2 from the GOG DQK
install.

`gbplayable-suite-test.ps1` is the focused sequential front-door gate for the
three primary Krynn games, with optional real-data non-Krynn coverage: it runs
the CoK, DoK, and DQK playable canaries plus the DQK native `/R`
create-to-combat canary in order, then checks the Curse/CoAB, NWN, DQK Amiga
GLIB, Pool preview, Secret raw-GEO plus Secret GLIB ECL/GEO, Gateway GLIB
ECL/GEO, and Buck real-data flows when their local data is available. Pass
`-CoreOnly` to restrict
it to those core Krynn canaries. Optional flow output is replayed and
pass `-Headless` to forward no-focus/headless DOSBox mode to optional flows.
The final summary reports how many optional checks passed versus skipped, so a
missing local archive is visible without failing the core gate. The suite exists
because these scripts share `native\build` `_GB*` sidecars; running them in
parallel can create false failures by overwriting another flow's scratch
artifacts.
`gbdok-intro-flow-test.ps1` pins the matching DoK title-frame
path with bounded `TITLE.DAX` playback, optional `DOKTITLE.GBM` playback, and
compact native party creation; it first proves `/J` fails when `TITLE.DAX` is
absent, then reruns with `TITLE.DAX` and continues to a nonblank snapshot. The
GBBOOT detector smoke
also pins the synthetic title-helper tail for Pool, Secret, Gateway, Treasures,
Pools of Darkness, Buck Rogers Countdown, and Matrix Cubed when those broader
DAX profiles provide `TITLE.DAX`, without claiming local real title art for
profiles absent from this workspace.
The three-frame band compositor is restricted to CoK/DoK; other Gen1 profiles
retain the existing two-frame preview. The optional `-EngineSmoke` title/combat
case exposed an accidental Krynn overlay argument on Pool, reproduced with the
previous executable and corrected at the profile branch. This does not claim
full native playback of every other title archive's frame sequence.
The 2026-09-08 optional `gbboot-test.ps1 -EngineSmoke` run passes these eight
title/combat cases and CoK/DoK roster writeback, but remains red at the DQK
`/A 66` transcript expectation `GBSX count=0010`. Old/new GBBOOT controls emit
byte-identical transcripts with `GBSX count=0026`; later optional cases are not
covered by that run. This is separate from the flow sweep below, whose
denominator is **30** as of 2026-09-10 (`$flowScripts` in `native/test.ps1`,
counted directly). This sentence read `27-script` until 2026-09-10, correct
when written on 2026-09-08 and superseded when `ccecl-dok-b51-watch-test.ps1`
and `cgb-gbim-test.ps1` were enrolled; re-derive the count rather than copying
it forward.
Current sweep (2026-10-04): `gbdok-intro-flow-test.ps1` is PASS after the identity-checked GameLink ACK path.

**THE `/A 66` HALF OF THAT PARAGRAPH ENDED ON 2026-09-10 (`f05f57b`), and the
paragraph is left standing above so the change is visible.** Read the two
sentences it quotes together and the defect is on the page: the run "remains red
at the DQK `/A 66` transcript expectation `GBSX count=0010`" while "old/new
GBBOOT controls emit byte-identical transcripts with `GBSX count=0026`" -- two
GBBOOTs 39 days apart agreeing to the byte is a stale PIN, not an engine gap, and
it was read as a red for two days. At that time `GBSX count=` saturated:
`fx_script_count` (`src/ccecl.asm`) was only incremented behind `cmp ax, SCRIPTCAP` /
`jae` and `dump_gbsx` (`src/ccefx.asm`) validated rather than clamped, so the
number printed was `min(real_events, SCRIPTCAP)` and truncation was silent. With
`SCRIPTCAP` having gone 16 -> 32 -> 64, the `0010` (16) authored 2026-07-15 was a
count clamped at the then-ceiling. `f05f57b` measured `0026` (38) in DOSBox;
that historical pin was later superseded again. `gbboot-test.ps1` now carries
`GBSX count=002C` (44 events) for `/A 66`. Four sibling `-EngineSmoke` cases
in the same file were
re-measured at the same time and had never been measured before: CoAB `/A 2 /B 2`
-> `GBSX count=0025` (37), `/A 3 /B 17` -> `GBSX count=0015` (21), `/A 5 /B 51`
-> `GBSX count=0037` (55), and `/A 4 /B 34` -> `GBSX count=0040`, which is 64 =
`SCRIPTCAP` EXACTLY. That last one is a CEILING, not a count: the real total is
unknown and `>= 64`. The current interpreter returns the named, state-preserving
capacity halt before it can lose the next effect, so it is deliberately not filed
as a measurement -- its call declares
`-GbsxSaturated $true` and `Assert-GbsxNotTruncated` compares against the cap
parsed out of `src/ccecl.asm`, so raising the cap turns that case red and forces a
re-measurement instead of quietly passing at 64 < 128.

**Do not read any of that as `-EngineSmoke` going green, because it did not.**
`gbboot-test.ps1 -EngineSmoke` still EXITS 1, now on an unrelated and pre-existing
`XSEED GBPS length expected 150, got 3160`, plus 14 further pre-existing drifts (5
GBPS-length, 9 combat) that were confirmed byte-identical against a build of the
HEAD copy of the script and are therefore not caused by the re-pin. What the same
commit did fix is a defect that had been hiding every CoK case behind a generic
message: `gbboot-test.ps1` execs ten helper COMs and its copy list carried nine,
omitting `CCINV.COM`, so each CoK case died at `run_native_preview` gate 7 behind
"native preview failed". Failures over the whole optional run went 64 -> 14. This
file is in no sweep -- `native/test.ps1` invokes it directly, outside both its
`$scripts` and `$flowScripts` arrays -- which is why nothing in the repo said so.

**2026-09-12 continuation.** CoK's verified RNG now produces its own exact
combat transcripts, so the combat, command, flee, roster-writeback, and
combat-to-map smoke controls no longer compare a CoK result with the generic
LCG fixture. `GBBOOT` also accepts a two-member CoK `GBCR` result when CCECL
used its intentional fallback party and GBPR has no persisted members; it still
requires an exact count for every populated roster. The refreshed optional run
passes those CoK controls and the former DQK area-4 halt: the deterministic
headless responder returns the first completed area-4 menu branch when it
reaches the same menu instruction, destination, and clamped answer again,
producing `GBEF v0009 flags=0021 status=0000 geo=0004` without `GBHD`. The full
optional suite is still not green: it now reaches an independently observed DQK
area-7 geometry divergence (`_GBWALL.BIN` is `28x28` where the captured route
expects `22x22`).

`gbdok-playable-flow-test.ps1` combines the verified DoK front-door pieces into
one title-to-gameplay proof: `GBBOOT /E /J /T 1` plays bounded `TITLE.DAX`
frames plus optional title music, creates a four-member compact native party
including a thief, refreshes GBPS movement rows plus a v2 thief matrix row from
GBD1 metadata, preserves the first-person session, and runs the bounded
descriptor-142 citizen SearchLocation event. The same smoke then relaunches
ECL3 block 81 with a real `/Y 4` attitude choice, proves the short-dialect
single-operand `PARLAY` stores that raw choice at `0x0084`, preserves the
town-mode marker `0x4BE6=1`, and reaches the original Dulcimer arrival text.
It then relaunches
block 32 from a persisted area-1 pose, steps into descriptor 154, reaches the
real healer `COMBAT` yield with no queued monsters, materializes the intended
`victory` outcome without launching `CCCOMBAT`, and resumes through `CCECL /R`
to `COME AGAIN SOON.` It then proves a natural tactical route: the persisted
area-1 pose `(10,1,east)` takes one legal CCFP step into ECL1/GEO1 block 34
descriptor 140 at `(11,1)`. The retail short-dialect script queues fifteen
Sivaks (`id=pic=0x21`), launches `CCCOMBAT` with the created `p0..p3` party,
writes `GBCR`/GBD1 combat state back to GBPR, and resumes through `CCECL /R`.
When the extracted DoK `CPIC1.DAA` is available, that same natural combat leg
uses `/G 2` to decode its real SIVAK picture block `0x21` into `_GBCP0.GBI`;
the canary validates the resource instead of treating the DOS tactical icon as
an Amiga result.
The smoke retains seeded ECL2 block 51 `vmRun1` as a separate far-pointer
research control, then confirms the post-combat compact GBPR can return to the
clean descriptor-142 citizen SearchLocation step without tactical artifacts.
The 2026-10-02 run uses the held WHDLoad DoK art when the old extraction is
absent, so this route is measured instead of skipped for missing artwork.
Latest full sweep (2026-10-09): `gbdok-playable-flow-test.ps1` PASSes in 133
seconds on unchanged native source. The previous 2026-10-08 sweep's
300-second timeout after area 16 / PC 1741 did not reproduce in either the
isolated 138-second run or this complete 44/44 PASS sweep.
`ccecl-dok-combat-gap-test.ps1` (**was RED as of 2026-09-05 when this was written; that red run
ENDED on 2026-09-10 — the script is PASS in `native/flow-status.json` and is no longer red**) also pins the important empty-combat control: real
`ECL1.DAX` block 32 descriptor 26 reaches a `COMBAT`
yield after `PARTY_SURPRISE`, but the exported `GBEF` has no queued
`LOAD_MONSTER` groups. A direct `CCCOMBAT /E` probe correctly rejects that
payload instead of inventing enemies, while the full `GBBOOT /E /A 1 /B 32 /T 1`
map-step route treats the empty/no-enemy combat as an immediate victory and
resumes through `CCECL /R`, producing the post-combat `COME AGAIN SOON.` text.
The same smoke also records block 33 descriptor 23 as a `SURPRISE`-only route
(`GBEF flags=0020`) that exits without combat and without queuing any
`LOAD_MONSTER` groups. **Corrected 2026-09-09**: this line previously read
"a `LOAD_MONSTER` + `SURPRISE` route", which measured wrong against the real
`DOKSURP.TXT` dump -- there is no `GBEC`/`MONSTER` section on this route at
all, only the bare `#00 OP=23 SURPRISE` event. A block-36 normal SearchLocation
probe (`/J 0 /X 19691 3 /X 19462 1`) now pins the real random selector update:
`RANDOM #2, [0x7F79]` writes the selector destination, not memory cell `0x0002`.
With the deterministic native RNG this route exits before `SETUP_MONSTER`,
monster queuing, or `COMBAT`; the adjacent `GOTO [8142]` tactical branch has no
incoming target from this SearchLocation dispatcher and remains a direct-entry
probe rather than a naturally reached route. The sweep now also walks all 28
block-36 `ON_GOTO` selector entries: selector 27's `SETUP_MONSTER #33` falls
through its `GOTO` into the same queued `LOAD_MONSTER` SIVAKS encounter
(`SIVAKS BESIEGE THE OUTPOST!`, `id=0021 count=0008`) proven elsewhere in this
file via the direct `/@ 33090` entry point -- it is a genuine tactical route
reached through the random-selector table, not a dead end. **Corrected
2026-09-09**: this line previously read "selector 27 reaches only
`SETUP_MONSTER #33` and then `EXIT`", which measured wrong against the real
`DS27.TXT`/`DS27.TRC` dumps produced by walking the selector table -- the
`GOTO` is live and lands in tactical combat, matching the same
`SETUP_MONSTER`-falls-through-its-`GOTO` pattern the next sentence already
documents for block-34 descriptor 12. The prior block-34 conclusion was a
long-frame decode error: DoK's `PARTYSTRENGTH` opcode has zero operands. With
the retail short frame selected by `DKK.CFG`, descriptor 12 continues through
`CLEAR_MONSTERS`, `LOAD_MONSTER SIVAK x15`, `COMBAT`, and the victory
persistor. The broader
`ccecl-dok-route-scan.ps1` audit is intentionally outside the default serial
smoke, but it can batch-scan all shipped DoK `ECL1.DAX`/`ECL2.DAX`/`ECL3.DAX`
blocks read directly from the DAX TOCs through SearchLocation, vmRun1, slot 2
(PreCampCheck), and slot 3 across a configurable descriptor/cell-word prefix
and all four facings. `-WithThiefMatrix` adds a generated GBPS v2 six-member
thief matrix to the CCECL command tail, so the scan can model the same
selected-player party-data channel that GBBOOT now uses; the quick
`-SeedCount 1 -WithThiefMatrix` audit covers all four surfaces with no queued
tactical handoff. Its full headless baseline sweep over the descriptor byte range
(`-SeedCount 256`) scans 102,400 routes across SearchLocation, vmRun1, slot 2,
and slot 3 and finds no natural queued tactical handoff. vmRun1, slot 2, and
slot 3 produce no notable routes; the only notable SearchLocation results are
empty `COMBAT` yields at ECL1 block 32
descriptors 26/90/154/218, ECL3 block 96 descriptors 10/74/138/202, and ECL3
block 98 descriptors 3/67/131/195, plus queued-monster routes in ECL1 block 33
descriptors 23/87/151/215 and ECL3 block 82 descriptors 3/67/131/195 that exit
before `COMBAT`. The lighter default scan still covers SearchLocation, vmRun1,
slot 2, and slot 3 over 0..63 for all four facings. It writes
`build\_DOKROUTE.TXT` and `build\_DOKROUTE.CSV` for durable route evidence.
`ccecl-dok-chained-step-scan.ps1` closes the main false-negative risk in that
broad scan by decoding real DoK `GEO*.DAX` passable start->target steps and
running the same two-pass CCECL chain that GBBOOT walking uses: vmRun1 `/Q`
first, then SearchLocation `/J` with `/P` importing the vmRun GBEF state. Its
current default headless baseline covers all ECL/GEO areas 1..3 and all real
GEO blocks with nonzero descriptors. After the short-frame correction it finds
the three legal inbound routes to descriptor 140, including `(10,1,east)` ->
`(11,1)`, and reports the queued Sivak combat handoff for promotion into the
GBBOOT canary. `-AllDescriptors` remains the exhaustive opt-in variant for descriptor
zero coverage. It writes `build\_DOKCHAIN.TXT` and `build\_DOKCHAIN.CSV` for durable chained-step
evidence. `ccecl-dok-b51-provenance-scan.ps1` extends that audit by recording
the host-memory provenance for the known block-51 gate cells (`4CE9`, `4CE8`,
`4CE5`, `4C00`, `7F79`, `C04F`, and `C04E`) after both the natural vmRun1 pass
and the imported SearchLocation pass. Its default `-WithThiefMatrix` run checks
the same 8,027 real routes and finds `RowsWith4CE9Gate=0`, leaving the block-51
handoff a seeded host-state probe rather than a natural route. The optional
`-ProbeB51Selector` pass re-enters ECL2 block 51 selector 29 from each natural
vmRun state and each following natural SearchLocation state without the `4CE9`
sparse seed; the focused area-2/block-51 run checks 657 real GEO-derived routes
with `ProbeRowsWith4CE9Gate=0`, `ProbeRowsWithQueuedCombat=0`,
`SearchProbeRowsWith4CE9Gate=0`, and `SearchProbeRowsWithQueuedCombat=0`,
then follows the three natural descriptor-157 rows whose SearchLocation pass
leaves `7F79=001D` through `/J 29` and still gets
`SearchDispatchRowsWith4CE9Gate=0` and `SearchDispatchRowsWithQueuedCombat=0`.
That strengthens the current diagnosis that the missing source is host-owned
state rather than a hidden natural selector handoff.
It writes `build\_DOKB51PROV.TXT` and
`build\_DOKB51PROV.CSV`. `ccecl-dok-b51-watch-test.ps1` then keeps the same
gap executable under CCECL's existing `/T` trace: base `/Q 29`, the seeded
`/Q 29 /X 19689 1` control, and the three descriptor-157 SearchLocation
dispatch candidates are traced for the block-51 gate PCs and sparse writes.
Its current headless run writes `build\_DOKB51WATCH.TXT` and
`build\_DOKB51WATCH.CSV`, with `RowsWith4CE9Gate=1`,
`RowsWith4CE9Writes=0`, `CombatRows=1`, and
`Search29RowsWith4CE9Gate=0`. The only row with `4CE9=1` is the seeded
control; no natural/probed trace writes `MEM[4CE9]`, while the natural vmRun
rows do reach the `PC=020E` gate and then fall away with `4CE8=0010`.
`ccecl-dok-b51-watch-test.ps1` is GREEN as of 2026-09-10 in `native/flow-status.json`,
having earned a verdict; see the status note directly below, which retracts in place the
RED reading that stood here for the few hours between its first-ever measured verdict and
the assertions that answered it.
Current sweep (2026-10-04): `ccecl-dok-combat-gap-test.ps1` is PASS; the v15 block-51 ACK and separate combat path are both pinned.

**STATUS: `ccecl-dok-b51-watch-test.ps1` is GREEN as of 2026-09-10, and the word PASS
was EARNED rather than appended.** That RED reading ENDED on 2026-09-10, a few hours
after it was written. What stood here, retracted in place rather than deleted, was: "**STATUS: `ccecl-dok-b51-watch-test.ps1` is RED as of 2026-09-10, and the
red is the classification rule working, not a defect in the scan.** ... The script ends on
a verdict-free RESULT line and contains exactly **one** `throw` in 231 lines -- a
**120**-second timeout guard ... so it asserts nothing about content that a runner could
read. **Do NOT make it green by appending the word PASS to that line.** ... this one would
have to assert something before it could claim one." Every clause of that was true when
written and the last one is what ended: the script now asserts something. **The rule it
states did NOT end and still binds every script in this tree** -- a `RESULT: ... PASS` line
appended to a script that asserts nothing is buying the gate, and would be reverted.

The history it recorded stands: the script was enrolled in `native/test.ps1`'s
`$flowScripts` on 2026-09-10, having been in ZERO runners since `23ba497` on 2026-07-15,
which moved the sweep denominator 28 -> 30; its first-ever measured verdict was FAIL with
exit code **0** and the needle `exit 0 but no 'RESULT: ... PASS' and no 'SKIP:' line; last
stdout line: RESULT: DoK block-51 CCECL trace-watch scan completed`. The 120-second timeout
guard (`WaitForExit(120000)`; this said 60 here and in `CLAUDE.md` until 2026-09-10) is
still the file's only non-assertion `throw`.

**What earned the verdict.** The script now carries **19** assertion `throw`s beside that
one guard, under the `$ErrorActionPreference = 'Stop'` already at its top, with **no**
`try`/`catch` anywhere below the assertion banner -- the `try`/`finally` at the DOSBox wait
is the sole `try` in the file and a `finally` swallows nothing -- and `RESULT: DoK block-51
CCECL trace-watch scan PASS` is the **last line of the file**, reachable only if all 19
clear. That is the same shape `ccecl-dok-combat-gap-test.ps1` earned its own PASS with (82
`throw`s, RESULT last).
Current sweep (2026-10-04): `ccecl-dok-combat-gap-test.ps1` is PASS; the v15 block-51 ACK and separate combat path are both pinned.

**The twelve assertions, and what justifies each.** Nothing below is pinned because today's
run emits it. Most are derived from `native/src/ccecl.asm`; the rest are values this README
has carried since `23ba497` on **2026-07-15** and that still reproduce today, **83 commits to
`native/src` later** -- 57 days and 83 commits, not one run. Each bullet says which, and
says one/two-sidedness out loud.

- **A1, null, one-sided.** Every one of the 11 cases produced a parsable `GBEF` record.
  `Status` is initialised to the literal `MISSING` and replaced only when the `.BIN` exists,
  is at least 2246 bytes and opens with the `GBEF` magic. Without it, a dead DOSBox makes
  A3/A4/A8 vacuously true -- and does: the M5 mutation below prints `gateRows=0
  gateWriteRows=0 combatRows=0` with the scan otherwise intact.
- **A2, null, one-sided.** Every one of the 11 traces recorded at least one `MEM[]` write,
  checked on `7F79` because the Gen1 handler seeds that cell on every path. `Get-TraceStats`
  returns all-zero counters when the `.TRC` is absent, which is indistinguishable from "the
  trace ran and saw no `MEM[4CE9]` write". The exact write count is deliberately NOT pinned.
- **A3, TWO-SIDED.** Exactly one row carries `MEM[4CE9]`, and it is `seeded-q29-4ce9` **by
  name**, with value `0001`. `/X 19689 1` is `add_memory_seed 0x4CE9 = 1` applied by
  `apply_memory_seeds` on the handler path, so that row's gate is required by construction.
  RED at 0 = the seed stopped reaching the record; RED at 2+ = a natural route acquired the
  gate, which is the discovery this scan exists to catch and must not pass silently.
- **A4, one-sided, made non-vacuous by A1+A2.** No row's trace writes `MEM[4CE9]`
  (`RowsWith4CE9Writes=0`, carried since 2026-07-15) -- the standing host-owned-gate
  diagnosis.
- **A5, cross-instrument.** The emitted `GBRS` sparse table and the per-instruction `MEM[]`
  trace are two independent instruments; a cell present in the record with no `/X` seed and
  no traced write means one of them is lying.
- **A6, TWO-SIDED per row, source-derived.** `MemC04F` equals the descriptor the case asked
  for on its `/Q` or `/J` operand (`001D` for 29, `009D` for 157) -- the handler seeds `C04F`
  with `[cell_descriptor]` verbatim. The `$cases` table now carries a `Descriptor` field so
  the check is against what was ASKED FOR, not against what came back.
- **A7, TWO-SIDED per row, source-derived.** `MemC04E` equals `facing shl 1 and 0006h`, the
  Gen1 `MapDirection` encoding 0=N,2=E,4=S,6=W. **Stated limit:** no case uses facing >= 4,
  so this discriminates the shift, not the mask.
- **A8, TWO-SIDED.** Exactly one row yields VM status `0003` (COMBAT) and it is the seeded
  control by name (`CombatRows=1`, carried since 2026-07-15). RED at 0 = the seeded DoK
  tactical handoff regressed; RED at 2+ = a natural route now reaches combat.
- **A9, one-sided, independent of A8.** No row ends at status `0004`. Halt reasons are bad
  opcode / step budget / sparse memory full / chain follow failure, every one a defect --
  and `CombatRows == 1` alone cannot tell a clean exit from a halt.
- **A10, TWO-SIDED relation between two instruments.** The combat row's saved pc is `0187`
  while its trace shows `PC=0186` exactly once. `op_combat` stores the operand pointer into
  `[pc]` and reads no operands, so the saved pc must be the traced opcode offset plus one;
  this README has recorded the block-51 `COMBAT` at PC `0186` since 2026-07-15.
- **A11, TWO-SIDED on the count plus a record contract on every row.** The combat row queues
  `0002` encounter groups -- `ccecl-dok-static-combat-scan.ps1`'s independently recorded "1
  x2 and 17 x8", two groups. The flag half is a relation, not a value: `FX_HAVE_ENC 0x0008`
  is `or`-ed in by `op_loadmonster`, so a nonzero group count cannot coexist with that bit
  clear.
- **A12, TWO-SIDED across the phase split, and the weakest justification in the set** -- a
  reproduced measurement, not a source derivation, and labelled as such in the script. Every
  `vmRun*` row traces `PC=020E`; no `search*` row does. Carried here since 2026-07-15.

**Nine candidates were REJECTED as unjustifiable, and naming them is the point.** (1)
`Rows=11` and (2) `Search29Rows=3` are tautologies over the hard-coded `$cases` table --
`$rows` is built one-per-case with no filtering, so they restate a literal; A1 is the
non-tautological transform of the first. (3) `Mem7F79` as a value: the *seed* is
source-derived, but `Write7F79` is 11/1/2 by phase, so the script overwrites it before the
record is written and the surviving `0008`/`001D`/`0000` have no derivation -- only the
`> 0` write count survives, as A2. (4) Exact traced-write counts (`Write7F79 = 11`) are
loop-iteration artifacts. (5) `Mem4CE8 = 0010`: quoted above as a real measurement, but 16
is a VM-computed value with no contract predicting it -- transcription. (6) Terminal PCs
`02D7`/`0344` for the natural rows: unlike `0187` nothing derives them and there is no
second instrument to check them against. (7) `Pc01ED = 1` / `Pc0203 = 1` exact visit counts
for PCs the finding never reasons about, and (8) `Mem4C00` present-on-search /
absent-on-vmRun, a difference nobody has explained. (9) `Flags` as a literal `0020`/`0028`:
`FX_HAVE_SCRIPT 0x0020` is `or`-ed in by roughly ten unrelated opcodes, so the literal pins
which of them happened to run -- kept only as A11's `Enc > 0 implies bit 3` implication.

**Six mutations, each seen RED with the naming assertion, each restored by SHA-256** to the
asserted script `4b1a514a7a6872d63c30db1dc70c86dfd4c24a13e06704c3eb385c59af282f95`. The
experiment was mutated, never the assertion under test. M1 dropped `/T` from every CCECL
line -> A2, exit 1, **and the run still printed `gateWriteRows=0`**, which is precisely the
vacuity A2 exists to catch. M2 dropped `/X 19689 1` -> A3 at the 0 side. M3 added
`/X 19689 1` to the natural `base-q29` line -> A3 at the 2 side, `gateRows=2`. M2b repeated
M2 with A3's three throws temporarily short-circuited, to reach A8 in isolation -> A8 at the
0 side; A8's 2 side is unreachable without a second seeded row, so it is covered by M3's
`combatRows=2` reaching A3 first, and that is stated rather than claimed as an A8 mutation.
M4 forced `/F 0` on the dispatch loop while the table still said facings 1/2/3 -> A7. M5
misnamed one output `.BIN` -> A1.

Its numbers above remain a real measurement and were unaffected by the verdict question --
what was missing was a pass/fail claim, not data. That is no longer missing.
`dok-retail-hoststate-scan.ps1` adds a bounded
heuristic scan of the shipped DoK `START.EXE` and `GAME.OVR` bytes for the
little-endian host-state cells that feed that gate (`4CE9`, `4CE8`, `4CE5`,
`4C00`, `7ED5`, `C04D`, `C04F`, `7F79`, and `C04E`). Its current run writes
`build\_DOKHOSTREF.TXT` and `build\_DOKHOSTREF.CSV`, finds 15 raw byte hits,
and classifies all four `4CE9` matches as near-jump immediate overlap rather
than direct memory writes, with `Potential4CE9WriteHits=0`. This is not a
runtime proof: `START.EXE` is packed/self-decompressing and `GAME.OVR` file
offsets are not DS addresses. It simply narrows the next probe to runtime watch
or deeper 16-bit disassembly of the host state path.
The DoK tactical bridge itself is not the blocker: seeded block 51 already
emits a queued `GBEF`, launches `CCCOMBAT`, writes `GBCR`, and resumes. The
next implementation target is a DoK-specific host-state/dispatcher derivation
analogous in role to the DQK natural handler promotion, but it should not be
added until the original host source of `MEM[4CE9]=1` is proven by runtime watch
or disassembly.
A separate
`ccecl-dok-static-combat-scan.ps1` conservative control-flow audit finds one
queued Gen1 far-pointer candidate outside those natural route sweeps: ECL2
block 51 `vmRun1` reaches `COMBAT` at PC `0186` after loading monster groups
`1 x2` and `17 x8`. The gap smoke now proves that candidate at runtime with
`CCECL D:\ECL2.DAX 51 /Q 29 /X 19689 1`, runs it through `CCCOMBAT` against the
real `MON1CHA.DAX`, writes a raw tactical viewport and `GBCR`, and resumes the
saved ECL state with `CCECL /R`. It is a real vmRun1 queued tactical handoff,
and `GBBOOT /E /X /A 2 /B 51 /1 29 /0 19689 1` now lifts that same seeded
far-pointer route through the boot host, including `CCCOMBAT`, raw tactical
viewport, `GBCR`, resume, and the follow-up SearchLocation pass. That final
SearchLocation continuation is allowed to complete without a GEO handoff: for
this seeded `/1` research route, the validated artifacts are the preserved
event, tactical result, resume state, and search continuation, not an extra
first-person frame. It is still
seeded host state rather than a naturally discovered GBBOOT dungeon step:
`ccecl-dok-static-combat-scan.ps1` audits the local DoK
`GEO1.DAX`/`GEO2.DAX`/`GEO3.DAX` plane-2 data and finds no cell whose
descriptor is 29. The static scan writes `build\_DOKSTATIC.TXT`,
`build\_DOKSTATIC_COMBAT.CSV`, `build\_DOKSTATIC_REFS.CSV`, and
`build\_DOKSTATIC_GEO29.CSV` for the candidate list, host-state references, and
GEO descriptor audit. `ccecl-dok-thief-matrix-test.ps1` (**was RED as of 2026-09-05, and red
before that round -- that claim ENDED on 2026-09-10**, when a full sweep first observed it
exit 0; `native/flow-status.json` records it PASS with `first_observed_green:
2026-09-10`. The stale red claim stood here for days because arming the flow-status
disclosure checker is manual -- the same exposure this repo records elsewhere: a gate you
have to remember to arm records nothing about the days you did not.) It separately proves the
new GBPS v2 selected-player thief-skill path for that block-51 trap gate: a
high per-member matrix reaches the `FINDS A TRAP` branch with no sparse
`/X 7CA7` seed, while a zero matrix does not. The TypeScript VM oracle now also
locks this distinction against the real block-51 bytes: high-skill trap-found
halts at the same post-`PARTYSTRENGTH` bad-op boundary that CCECL treats as a
clean script-effect exit, and low-skill failed-trap writes `4CE8=0x10` but not
`4CE9`. That makes the static `4CE9` writer a non-executable reference under
the current opcode framing evidence, not a proven natural path into the queued
combat branch.
Current sweep (2026-10-04): `ccecl-dok-thief-matrix-test.ps1` is PASS. It verifies the v15/status-2 ACK, typed CCFLOW sidecar, GameLink-serviced menu and XP ACKs, and both DISARM/LEAVE continuations with their trace PCs.

`ccecl-dok-combat-gap-test.ps1` (**was RED as of 2026-09-07 when this was written; that red run
ENDED on 2026-09-10 — the script is PASS in `native/flow-status.json` and is no longer red**) also pins the first live Gen1 vmRun1 facing gate in this area: `CCECL /Q 14 /F 2`
seeds DoK's `[0xC04E]` as MapDirection `4`, passes the descriptor/facing branch,
and emits the stairs prompt without hand-writing that memory cell. The smoke also uses the test-only
`CCECL /@ 33090` direct-entry probe to enter real tactical subroutines in block
36 (`SIVAKS BESIEGE THE OUTPOST!`, `LOAD_MONSTER #33 x8`) and block 34
(`LOAD_MONSTER #33 x15`, followed by a post-combat `SURPRISE` continuation).
Both are valid `GBEF` COMBAT handoffs and run through `CCCOMBAT` against DoK's
real `MON1CHA.DAX`, producing trace, nonblank tactical RAW, outcome, and `GBCR`; both
then resume the saved `GBRS` state with `CCECL /R`. `GBBOOT /E /X /A 1 /B 36
/@ 33090` and `GBBOOT /E /X /A 1 /B 34 /@ 33090` lift those direct-entry probes
through the boot host, proving GBBOOT can own the DoK `CCECL -> CCCOMBAT ->
CCECL /R` loop and preserve the nonblank tactical RAW, trace, outcome, and `GBCR`
artifacts. DoK is therefore verified through exploration, empty-combat resume,
a pinned SearchLocation random-selector branch, a selector-27 `SETUP_MONSTER`
fall-through into queued tactical SIVAKS combat, a block-34 descriptor-12
`SETUP_MONSTER` fall-through into the same queued tactical handoff (**corrected
2026-09-09**: both of these previously read "setup-only"/"attack-text-only",
i.e. non-combat dead ends -- measured wrong; see the block-36 selector-sweep
correction above), a Gen1 vmRun1 facing-seed branch, a
noncombat Gen1 PreCampCheck `/2` state-update branch, a seeded ECL2 block-51
vmRun1 queued tactical loop owned by both CCECL and GBBOOT, and two direct real
tactical loops, but not yet through a naturally reached dungeon-step tactical
handoff.
Current sweep (2026-10-04): `ccecl-dok-combat-gap-test.ps1` is PASS. Block-51 trap-found now pins the typed ACK boundary, while the separate queued-combat fixture and block-34/36 tactical routes remain green.

**A separate, genuine GBBOOT engine defect was found 2026-09-09 while
re-verifying the natural block-36 vmRun1 step probe, and is NOT fixed here**
(this file's own instructions require stopping and reporting rather than
editing `.asm` to work around it): `GBBOOT /E /A 1 /B 36 /T 1` fails with
"native preview failed" regardless of the `Set-Session` start position --
reverting to any tested coordinate reproduces the identical failure before
CCFP ever runs (no CCGEO/CCFP output appears in the transcript at all,
between `CCPARTY: loaded 6 member(s)` and the failure line). `/B 35` fails
identically; `/B 32` (used earlier in the same file) succeeds. Manually
replicating GBBOOT's own composed pipeline outside `gbboot.asm` -- the same
`CCECL D:\ECL1.DAX 36` raw-entry call, then `CCGEO /B D:\GEO1.DAX 36`, then
`CCFP <wall> /N <session> /Y <step> /M F` -- succeeds end-to-end for block 36,
so the external tools and the GEO/ECL data are not the defect; it is specific
to `gbboot.asm`'s own internal dispatch for these two block numbers. See
`native/ccecl-dok-combat-gap-test.ps1`'s comments around its `_gbboot_dok_vmrun_step.conf`
block for the full evidence trail.
Current sweep (2026-10-04): `ccecl-dok-combat-gap-test.ps1` is PASS. The selector-27 and block-34 descriptor-12 routes reach combat; the trap/thief producer stops at its source-faithful typed ACK.

**RETRACTED 2026-09-10, and BOTH of its claims were wrong.** The sentences that stood
here read: "That script is still red as of 2026-09-10, and this defect is exactly what it
is red ON: `native/flow-status.json` records its verbatim needle as `GBBOOT DoK vmRun step
did not enter descriptor 14 facing south`. The suite red and the engine defect described
here are one finding, not two." They are two findings, not one, and neither half survives:

* **The script is PASS**, measured in two consecutive full 30-script sweeps on 2026-09-10.
* **The red it carried was never this defect.** It was the descriptor pin `14`, which was a
  TEST bug: 14 and 142 are two different cells' raw roof bytes, and a commit that moved
  `Set-Session` from `4 5 4` to `3 8 4` updated the x/y pins but left the descriptor
  literal behind. The engine was right to write the byte raw — bit 7 is `ROOF_INDOOR_BIT`,
  a live flag, and eight other readers across four titles pin raw values with bit 7 set.
* **The `/B 36` "native preview failed" defect does not reproduce.** Re-measured 2026-09-10
  with `_GBSTEP.BIN` and `DOK36STP.BIN` deleted first: the transcript contains no
  "native preview failed" line anywhere and `_GBSTEP.BIN` is freshly written with
  `desc=142 x=3 y=9 facing=4` — coordinates only the `/B 36` run itself can produce, since
  it is the run that consumes `Set-Session 3 8 4`.
* **The original diagnosis rested on a stale artifact.** It inferred "GBBOOT never reaches
  CCFP" from the ABSENCE of CCGEO/CCFP lines in a redirected transcript, corroborated by
  `DOK36STP.BIN` bytes byte-identical to the earlier `/B 32` run's — which is what a stale
  COPY looks like, not what a failed run proves. The conf copies that file without creating
  it, so it now deletes both first; a failed run then leaves the assertions nothing to read
  instead of a previous run's answer.

**NOT established:** whether the failure was real on 2026-09-09 and has since been fixed by
one of September's commits, or whether it was never real. No bisect was run, and this
measurement cannot separate those. The original note is kept verbatim in the script so the
question stays answerable.

For DQK-class HLIB installs, `/E /J` decodes the verified `TITLE.TLB` title art
through CCHLIB into `<tools-dir>\_GBTITLE.RAW` before the saved-party/ECL/GBWS
boot chain. `gbdqk-intro-flow-test.ps1` (**was RED as of 2026-09-05 and red before that round; that red run ENDED on 2026-09-10 -- two controlled 30-script sweeps that day, 28 PASS / 2 FAIL with ZERO status changes and byte-identical needles between them, both record PASS**) first proves `/J` fails when
`DISK1\TITLE.TLB` is absent, then reruns `GBBOOT /E /X /J /A 18` with title art
present and verifies the decoded title RAW, optional DQK XMI-derived GBM1
music-only playback, six-member QSV party seed, area-18 ECL effects, and
nonblank GBWS first-person snapshot.
**STATUS: `gbdqk-intro-flow-test.ps1` was RED as of 2026-09-10 and red before that round; that red run ENDED later the same day.** It is the sharpest case in this file: it is FAIL in **all 40** committed revisions of `native/flow-status.json`, so 2026-09-10 is its first green ever. (`CLAUDE.md` records "one byte-identical needle across all 39"; re-derived here the figure is 40 revisions and **2** distinct needles, because `9562b8f` deliberately rewrote the message when it split the compound `-or` chain.) Before the fix,
`native/flow-status.json` records its verbatim needle as `GBBOOT DQK /J did not load the
six-member QSV party count into GBPS`, which the script does carry.
Current sweep: `gbdqk-intro-flow-test.ps1` is PASS (2026-10-02).

**CORRECTED 2026-09-10, and the retracted sentence is printed rather than deleted.** This
status line read, from 2026-09-05 until now: "STATUS: not individually re-measured; classified
PASS by the round-37 27-script sweep." **Both of its clauses are false, and it was false on the
day it was written.** The round-37 sweep DID measure this script individually -- that runner
measures one script per `pwsh -NoProfile -File` child, which is the whole reason it can report a
count -- and it classified this one **FAIL**, not PASS. Commit `10af271` introduced that sentence
and the round-37 artifact in the SAME commit, so the artifact contradicting it shipped beside it.

**Evidence, three independent strands, none of which is "decide which document to trust".**
(1) The round-37 artifact itself: `git show 10af271:native/flow-status.json` lists this script
among its eight FAILs, on needle `GBBOOT DQK /J did not load the six-member QSV party count into
GBPS`. (2) Every one of the 39 committed revisions of `native/flow-status.json`, from `10af271`
through `9722fec`, records this script FAIL with that same byte-identical needle -- it has no
recorded green in the artifact's entire history, and its `history.ever_green` is `null` ("no
prior artifact entry"), not `true`. (3) This README already said so two ways: the round-37
summary paragraph in "Flow coverage" names `gbdqk-intro-flow-test` first in its list of the
eight still red, and the sentence immediately above this block discloses the same script as red.
The file therefore contradicted itself across five lines for five days.
**All three strands are as of 2026-09-07, and the never-green run they establish ENDED on
2026-09-10** -- two controlled 30-script sweeps that day record this script PASS, its first
green in the artifact's history. Re-derived while making that edit: the count is now **40**
committed revisions, all FAIL, and the needle is byte-identical across **2** distinct texts
rather than one, because `9562b8f` deliberately rewrote the message when it split the
compound `-or` chain into self-naming throws. The evidence above is left intact: it is the
record of the five-day contradiction, and a fix to the script does not retire the lesson
about the rule that could not fire.

**This is NOT the C11 shape, and saying so is the point.** A true claim filed under the wrong
subject can be repaired by moving it; this one cannot, because no script it could belong to is
missing a round-37 status block -- `gbdqk-playable-flow-test.ps1`, `gbdqk-create-test.ps1` and
`gbdqk-multistep-flow-test.ps1` each received their own in that commit, and each is recorded PASS
with its own prose. There is no orphan subject. It is simply **false**: a placeholder written in
place of a removed misattributed block, never checked against the artifact produced alongside it.

**And no gate could have caught it, which is the generalisable half.**
`check_readme_agreement` in `tools/test_native_flow_status.py` holds a FAIL script's passages to
a *disclosure* requirement and fires `(i-c)` only when the README calls a **PASS** script red.
The inverse -- calling a **FAIL** script passing -- is unreachable by that rule, and the
paragraph satisfied disclosure anyway via the "RED as of 2026-09-05" parenthetical one sentence
earlier. The armed gate was green on this artifact while this sentence stood.

A status block that stood here until 2026-09-05 (round 37) claimed this script fails on a
`@00 MONSTER id=002E count=0002 pic=002E` pin. **That block was about
`gbdqk-playable-flow-test.ps1` and is now printed in that script's own entry below.** It cannot have
been about this one: `gbdqk-intro-flow-test.ps1` was 160 lines when that block was written at
`42c315e` (182 today, after `9562b8f` split two `GBPS` `-or` chains) and contains zero `MONSTER`
needles, zero `CCCOMBAT`, zero `GBCR`, zero `CCECL /R`, and never enters area 5 -- so the combat
legs that block said "do not" run are legs this script does not have. `gbdqk-intro-flow-test.ps1`
was RED either way when this paragraph was written and is no longer (its red run ENDED on
2026-09-10) -- this paragraph corrects an old claim's SUBJECT, not its status. See "Per-script status blocks were misattributed" below.
Current sweep: `gbdqk-intro-flow-test.ps1` is PASS (2026-10-02).
Current sweep: `gbdqk-playable-flow-test.ps1` is PASS (2026-10-04). The independent combat oracle verifies the four-dragon trace, one leaving reaction, enemy outcome, six GBCR records, and the QSV max-HP row.

`gbdqk-playable-flow-test.ps1` takes the
next bounded boot-to-gameplay step:
`GBBOOT /E /J /T 1 /A 18` starts from a verified area-18 pose, decodes the title
art, loads the six-member QSV party seed, builds the 16x11 GBWS wall bridge,
moves from `(10,0)` to `(10,1)`, yields descriptor 22, and continues through
CCECL into the `TAVERN` event. The same smoke then relaunches area 5 from a
persisted `(0,1)` north-facing pose, naturally reaches the proven dragon
selector at `(0,0)`, derives the CCECL sparse vmRun keys, dispatches the slot-3
combat handoff, materializes the six embedded QSV heroes into `_GBPARTY.GBP`,
runs `CCCOMBAT` with that roster, writes a six-row `GBCR`, and resumes through
`CCECL /R` while rejecting blank tactical RAW frames. It then launches once
more without `/R`, reloads that post-combat GBPR, takes the same clean area-18
TAVERN noncombat step, verifies no tactical sidecars are written, confirms the
roster bytes stay unchanged, and finally runs a post-combat `/E /X /A 18`
snapshot that rebuilds the 16x11 `WGRD`/GBWS bridge and verifies a nonblank
multi-colour first-person `_GBVIEW.RAW`.
**WAS RED ON A STALE PIN; FIXED AND PASSING as of 2026-09-05 (round 37 R4).** This script pinned
`@00 MONSTER id=002E count=0002 pic=002E` while the engine emits `count=0004` deterministically
(four runs, same needle; two saved `DQKPC.TXT` dumps byte-identical). The break dates to `e3ce79f`
(2026-07-28), which corrected the same pin in `ccecl-dqk-combat-test.ps1` and
`gbdqk-combat-flow-test.ps1` and missed this file and two siblings. R4 established something
stronger than "the pin drifted": **`0002` was never obtainable from retail DQK data at all.** Area
5's dragon count is ECL word `0x00C2`, computed by `RANDOM #3` then `ADD #3`, so retail can only
produce {3,4,5}. The `2` was CCECL's own host seed (`derive_dqk_handler_state` sets `[0x00C1]=3`,
`[0x00C2]=2`) leaking through a long-`PARLAY` framing desync that `e3ce79f` fixed -- the test was
reading the harness's own input. Because `0004` is RNG-dependent within {3,4,5} and therefore a weak
pin on its own, R4 added an RNG-independent range guard on `[0x00C1]` and `[0x00C2]` **ahead of** the
literal needle, so the guard can actually fire. Everything described above now runs.
Current sweep: `gbdqk-playable-flow-test.ps1` is PASS (2026-10-04). The independent combat oracle verifies the four-dragon trace, one leaving reaction, enemy outcome, six GBCR records, and the QSV max-HP row.

`gbdqk-create-test.ps1` covers the no-save-file DQK path: `GBBOOT /E /T 1
/A 18 /R ...` creates four native compact DQK members through CCPARTY `/G /ID 3`,
refreshes GBPS v2 party count and movement rows from their `GBD1` tails,
continues into the area-18 `TAVERN` step, then relaunches without `/R` into
area 5 and proves the persisted native-created compact roster is the four-member
tactical side consumed by `CCCOMBAT`/`GBCR`. **It passed in the historical 2026-09-13 measurement.**
The former `00C1=3` red was a direct-slot-3 route defect: GBBOOT now enters
area-5 vmRun1 first, then resumes slot 3 from its emitted state, so the retail
RANDOM/ADD pairs generate `C1=5..9` and `C2=3..5`. The historical stale
`count=0002` pin was fixed in round 37. A "THIS SCRIPT HAS NEVER PASSED / requires the
`GBPS` seed header's version word to equal 1" block stood here until round 37; **it was about
`gbdqk-multistep-flow-test.ps1` and is now printed in that script's own entry below.** It cannot
have been about this one: its version check fails only below **2**, so it never
demanded version 1, and it pins the party-count word to **4**, not the 6 that block reports. See
"Per-script status blocks were misattributed" below.
Current sweep: `gbdqk-create-test.ps1` is PASS (2026-10-02). GBBOOT now passes both compact mode and DQK title identity to CCPARTY, preserving header ID 3 through create, reload, and combat.

`gbdqk-multistep-flow-test.ps1` adds the first DQK repeated-step host-state
proof: `GBBOOT /E /T 3 /A 5` starts from a known area-5 overland pose, walks
three open cells, and verifies that both the vmRun output `_GBEVT.BIN` and the
follow-up SearchLocation output `_GBECL.BIN` preserve the same DQK runtime rows
for facing, area id, party-location registers, and encounter cooldown. The same
smoke now also drives ordinary `GBBOOT /E /T 1 /A 5` steps into area-5
special positions `(3,2)` and `(5,4)`: GBBOOT supplies the CCECL sparse
vmRun selector/position/distance/ranger/strength seed keys, verifies the ship-required
text branch and the fisherman ship-offer plus `PARTY_SURPRISE`, then proves the
follow-up SearchLocation remains noncombat and writes no `_GBCOMB.*` or `GBCR`
artifacts.
**THIS SCRIPT HAD NEVER PASSED until 2026-09-05. It was committed already-red on 2026-07-15 and was
still red 52 days later; round 37 R4 made it green, so the never-green run ended at 52 days.** The
day-one cause was a wrong constant, not missing engine work: the test required the `GBPS` seed
header's version word to equal 1, and the run emits version 2, flags 1, count 6. Rebuilding GBBOOT
at `23ba497` -- **the same commit that added this test** -- and running its own `GBBOOT /E /T 3 /A 5`
also gives `GBPS ... version=2 flags=1 count=6`, and the file has exactly one commit in its whole
history. The version-2 select path (`mov word [seed_version], 2` under a nonzero
`seed_thief_matrix_count`) is present in `gbboot.asm` at `23ba497` and structurally unchanged at
`50b4444`. R4 did not simply swap the constant: `gbdqk-multistep-flow-test.ps1:203-218` now asserts
the version against **what justifies it** -- record length 216 and a populated thief-skill matrix --
so a version word that stops matching its own payload still fails here. The two `FISHER` needles
have a different history: they were green at `23ba497` and the engine changed under them, but the
old green was recording a **truncated** script, because `e3ce79f` made `0x22` zero-operand in area 5
so the third event now executes and the party actually sails. **A single verdict does not fit this
file** -- one assertion was wrong on day one and another was recording less behaviour than the game
has, so "was this test ever capable of passing?" had to be asked per assertion, not per file.
`ccecl-dqk-vmrun-test.ps1` (**was RED as of 2026-09-05 and red before that round; that red run ENDED on 2026-09-10 -- two controlled 30-script sweeps that day, 28 PASS / 2 FAIL with ZERO status changes and byte-identical needles between them, both record PASS**) pins the lower-level Gen2 per-step entry that DQK
needs before native combat can be complete: `CCECL /Q <cellWord> /F <facing>`
enters vmRun1, preserves packed cell words such as `0x0101`, seeds the raw DQK
facing ordinal at memory `0x0011`, and proves repeatable `/X <addr> <value>`
sparse-memory seeds reach the `GBRS` dump for logical CCECL keys such as
`0x0023`. Those keys are not original `DQK.EXE` DGROUP offsets. The same smoke now audits area 5's decompressed ECL member directly:
vmRun1 is an 8-way `ON_GOTO [0x0023]` logical neighboring-cell/travel selector, with a
shared `0x003E` ship/travel gate, and the representative `/Q` route is verified
to exit without faking a tactical `COMBAT` yield. The same smoke also pins two
real area-5 special-position vmRun branches: CCECL sparse selector 3 at `(0x0111,0x0112) =
(3,2)` emits the `YOU NEED A SHIP TO TRAVEL ON THE...` gate, while selector 7
at `(5,4)` emits the fisherman ship-offer text plus `PARTY_SURPRISE`; both are
script events, not `GBEF status=0003` tactical handoffs. It also pins the
strongest natural area-5 dragon candidate: selector 3 can move into table value
`0xE5`, leaving persisted CCECL sparse keys `00CA=14`, `00CB=5`, and
`00CC=0xE5`. CCECL's slot-3 setup now derives the remaining DQK sparse
encounter keys for that natural state (`0x0112=16`, `0x00C1=3`, `0x00C2=2`), so feeding the persisted
vmRun effect into slot 3 queues `LOAD_MONSTER #46 x2` and yields real
`GBEF status=0003` combat instead of only printing `DRAGONS ATTACK!`.
**Read that `x2` as a property of the HOST SEED, not of retail DQK (round 37 R4).** `0x00C1=3` and
`0x00C2=2` are values `derive_dqk_handler_state` writes itself for the direct `/@` handler-mode
entry -- this section already says these keys are not original `DQK.EXE` DGROUP offsets. Retail area
5 computes the dragon count with `RANDOM #3` then `ADD #3`, so it can only produce {3,4,5}, and the
natural route emits `count=0004`. Before `e3ce79f` a long-`PARLAY` framing desync let the host seed
survive into the natural path and be read back as the encounter's monster count, which is how three
flow tests came to pin a count retail cannot generate. This paragraph used to continue:
"**`ccecl-dqk-vmrun-test.ps1` still pins `@07 MEM key=00C1 value=0003`, `@0F MEM key=00C2
value=0002` and `count=0002`** ... Not done; round 38 owns it."

**PARTLY DISCHARGED 2026-09-10, and the unfinished half is the important one.** Those three pins
were re-derived from a fresh run in `0634e15` and now read `@07 MEM key=00C1 value=0006`,
`@0F MEM key=00C2 value=0004`, and a two-record encounter (`id=0034 count=0006` plus
`id=0025 count=0004`). **That is NOT the "coherent re-derivation against retail bytes" this
paragraph asked for, and it must not be read as one.** Note what those numbers are: `6` and `4` are
exactly **twice** the `0x00C1=3` / `0x00C2=2` the host seed writes, so the `x2` property this
section opens with is still fully in play, and `count=0006` still sits **outside** the `{3,4,5}`
that retail's `RANDOM #3; ADD #3` can generate. The re-derivation was against a fresh run of the
same seeded route -- it makes the pins agree with the engine, which was never the question. **The
open item is unchanged: whether these values are retail-generatable at all.** Round 38 still owns
that, and a green `ccecl-dqk-vmrun-test.ps1` is now evidence about the FRAME, not about the counts.

What the same commit DID settle is structural and separable: the encounter emits **two** monster
groups, not one. Both memory slots were already populated (`C1`, `C2`) while only one record was
emitted, because the Gen2 `0x27` TREASURE operand frame was the Gen1 `(8, 0xff)` and its skip
overran a matched `IF_GT; LOAD_MONSTER` pair. A before/after control with one variable (byte-exact
`ccecl.asm` restore, SHA-256 verified both ways) reproduces `groups=0001` on the old source and
leaves `DQK5N2.TXT`/`DQK5E5.TXT` byte-identical. Full evidence:
`docs/engine/research/ecl-gen2-treasure-operand-frame.md`.

The strongest single piece of evidence that the whole block was one stale state, and the one this
round started from, was a **fourth** pin nobody listed: `ccecl-dqk-vmrun-test.ps1:174`
(red on 2026-09-05 and red before that round; that red run ENDED on 2026-09-10) asserted the
long-frame `PARTY_SURPRISE` encoding
with three operands. That is the exact **long-frame** encoding `e3ce79f` had already replaced in the
sibling test -- i.e. the file was pinning the desync itself, not merely a value the desync produced.
**That prediction was correct and is now confirmed by measurement:** a fresh run emits
`'#01 OP=22 PARTY_SURPRISE ARGC=00'`, which is what `ccecl-dqk-vmrun-test.ps1:174` pins today. It
was also independent of the `0x27` work -- the dump carrying it is byte-identical before and after
that engine change.

**A DIFFERENT script, checked separately and found NOT stale:**
`native/ccecl-dqk-combat-test.ps1` (**was RED as of 2026-09-05 and red before that round; that red run ENDED on 2026-09-10 -- two controlled 30-script sweeps that day, 28 PASS / 2 FAIL with ZERO status changes and byte-identical needles between them, both record PASS** -- it fails
on `CCCOMBAT DQK trace length mismatch: expected 35, got 28`, which is not a staleness of these
pins) pins `id=0025 count=0004` at `:92`/`:190` and `00C2 value=0004` at `:197`, all inside the
retail `{3,4,5}` range, so round 38 need not re-derive **that** file's counts.
Current sweep: `ccecl-dqk-combat-test.ps1` is PASS (2026-10-02), at
`514d32e6`: both monster attack profiles reproduce the 48-row queued and
natural encounter traces, with LCG offset 12 and exact GBCR/resume checks.

> **Rebound 2026-09-05 (round 37).** The sentence above used to begin "Checked and found **not**
> stale, so round 38 need not touch it:" and ran on directly from the `ccecl-dqk-vmrun-test.ps1:174`
> paragraph -- a pin that **is** stale. Every clause was true of `ccecl-dqk-combat-test.ps1` and the
> nearest antecedent was the other script, so the passage read as clearing the very pin it was
> flagging. That is this round's own C11 -- a true claim bound to the wrong subject -- committed in
> the prose written to document C11, which is why the guard round 38 owes has to be mechanical
> rather than a lesson anyone remembers.
>
> **`ccecl-dqk-vmrun-test.ps1` was RED as of 2026-09-07 and red before that round; that red run ENDED on 2026-09-10.**
> **`ccecl-dqk-combat-test.ps1` was RED as of 2026-09-07 and red before that round; that red run ENDED on 2026-09-10.** Those two
> disclosures are here because the disclosure checker flagged this very blockquote: the note names
> two failing scripts and disclosed their status only in the paragraphs *above* it, and the old
> claims quoted inside it are correctly stripped before the scan, so nothing in the passage itself
> disclosed. **The guard fired on the fix for the defect it guards, and it was right to.**
> Distinguish that from round 35's failure, where a gate demanded a claim already disproven: this
> one demanded something true that the fix had simply left out. A correction is not exempt from the
> rule it is correcting under.
>
> **AND THE CORRECTION WAS ITSELF STILL RED FOR TWO DAYS -- found 2026-09-07 before the gate was armed by default.**
> The two per-script disclosures above stood as a single sentence from 2026-09-05 to 2026-09-07:
> "Both scripts named in this note -- ... -- are RED as of 2026-09-05, and red before this round."
> That sentence satisfied nothing. `tools/test_native_flow_status.py` classifies a sentence naming
> SEVERAL scripts as a ROSTER line, which by its own docstring "can neither be held to a per-script
> disclosure nor provide one" -- a rule that exists so deleting a script's own paragraph cannot
> leave a roster vouching for it. So the clause written to answer the guard was invisible to the
> guard by construction. A manual run at `edc8b37` still
> reported `(i-a)` for both scripts, at these exact lines, against BOTH the round-37 artifact and
> the 2026-09-07 one. **The fix for a disclosure defect was never re-run against the disclosure
> checker.** Nothing caught it because the live gate had not yet been made standing. Splitting
> one sentence into two per-script sentences is the entire repair -- the finding is not the repair,
> it is that the repair was owed for two days and no artifact said so.

`/J` still covers
SearchLocation. GBBOOT's movement-yield loop now runs vmRun1 before
SearchLocation for ECL-backed Gen1 and Gen2 profiles, carrying the `GBST` facing
into both handlers and preserving the resulting sparse memory across the second
pass. For Gen1 this seeds `[0xC04E]` as the even SSI MapDirection (`0,2,4,6`);
for DQK it seeds `[0x0011]` as the raw ordinal (`0,1,2,3`) and `[0x001B]` as
the active area id, matching the corrected cell-descriptor host model.
Movement-triggered vmRun output is written to `_GBEVT.BIN`; the follow-up
SearchLocation pass reads that state and writes the final `_GBECL.BIN`, so tests
can inspect both sides of the handoff instead of losing vmRun evidence to the
second pass. For DQK, GBBOOT keeps the `GBST` descriptor for SearchLocation but
passes vmRun1 the packed destination cell word derived from `GBST` x/y. It also
derives the proven area-5 north-edge dragon selector rows from the walked pose
instead of requiring manual `/X` or `/0` sparse-memory probes. A binary `GBRS`
scan then recognizes the natural dragon candidate CCECL sparse keys (`00CA=14`, `00CB=5`,
`00CC=0xE5`) and schedules slot 3 with the carried effect state instead of
falling through to SearchLocation.
`ccecl-dqk-combat-test.ps1` (**was RED as of 2026-09-05 and red before that round; that red run ENDED on 2026-09-10 -- two controlled 30-script sweeps that day, 28 PASS / 2 FAIL with ZERO status changes and byte-identical needles between them, both record PASS**) pins the first real DQK queued encounter route:
area 5 far-pointer slot 3 dispatches through inline `GETTABLE` data, prints the
DRAGONS encounter text, queues `LOAD_MONSTER #46 x2`, yields `COMBAT`, resolves
the fight through `CCCOMBAT` against real `DISK2\MONCHA.GLB`, writes `GBCR`, and
resumes the ECL state with `CCECL /R`. It now also proves the natural-E5 setup:
area-5 `vmRun1` first computes the persisted `0xE5` selector keys, slot 3 derives
the matching CCECL sparse encounter keys, and the resulting dragon handoff runs
through the same exact CCCOMBAT trace, `GBCR`, and resume path.
`gbdqk-combat-flow-test.ps1` lifts that
same route into `GBBOOT /E /A 5 /3 0 /X`. Slot 3 is not a standalone DQK
entry: GBBOOT first runs vmRun1 with its host selector keys, retains that
noncombat state in `_GBEVT.BIN`, recognizes its `CA`/`CB`/`CC` transition, and
only then cold-resumes slot 3 from it. The final seed sidecar is deliberately
cleared after the first phase; the smoke therefore inspects the vmRun effect and
the final retail-generated `C1=5..9`/`C2=3..5` words, rather than asserting
stale bootstrap values. The active combat bridge is written to `_GBECL.BIN` so
CCCOMBAT and the later `CCECL /R` resume consume the correct effect file. The
smoke verifies both phases, tactical RAW snapshots with blank-frame rejection,
exact trace, `GBCR`, and persisted resume state. The remaining
smoke now also runs `GBBOOT /E /T 1 /A 5` from a persisted `(0,1)` north-facing
pose with no explicit `/3` or `/0` probes. That ordinary headless step reaches
`(0,0)`, derives the DQK area-5 host rows, produces the natural `0xE5` vmRun
state, auto-schedules slot 3, and verifies the same DRAGONS combat trace,
`GBCR`, outcome, and resume state. Broader DQK live-game work remains to map
more special-position host rows beyond this pinned route. **CURRENT STATUS,
2026-09-13: PASS.** The clean 30-flow sweep exercises both the direct and
ordinary-step stages.
Current sweep: `ccecl-dqk-combat-test.ps1` is PASS (2026-10-02), at
`514d32e6`: both monster attack profiles reproduce the 48-row queued and
natural encounter traces, with LCG offset 12 and exact GBCR/resume checks.
Current sweep: `gbdqk-combat-flow-test.ps1` is PASS (2026-10-04). Slot-3 and natural routes match the independent four-dragon combat oracle and both validate the enemy outcome, GBCR, GBPR and resume records.

The test uses the same fresh-QSV natural route as the playable flow. The
seeded four-black-dragon encounter ends with all six party members unconscious;
the independent MONCHA/LCG oracle accounts for one primary-damage leaving
reaction that does not consume the dragon scheduled-attack cursor.

It then runs `CCPARTY.COM`, which validates CoK `SAVE\CHRDATA1.SAV` through
`CHRDATA6.SAV`, with `/G` DoK `SAVE\CHRDATA1.GAM` through `CHRDATA6.GAM`,
or with `/Q` the six embedded DQK `SAVGAMA.QSV` CCH-style records, falling
back to loose DQK `SAVE\CHRDATA1..8.QCH` and GOG-root
`cloud_saves\SAVE\CHRDATA*`/`CHRDATB*`/`CHRDATC*` QCH families when QSV is
absent, and writes `_GBPARTY.GBP` beside GBBOOT. The version-2 `GBPR`
header records title ID 1/2/3 for CoK/DoK/DQK and schema 1. Each entry
contains its original slot number followed by a 409-byte body,
preserving CoK's complete 409-byte records byte-for-byte. CCCOMBAT can also
read the matching CoK `SAVE\CHRDATA#.STF` sidecars from the current game
directory during `/P` import; that derives readied Plate Mail, Ring Mail,
Shield, Long Sword, Hoopak, Mace, Short Bow, and Arrow combat effects when
those sidecars are available, while still keeping GBPR itself lossless. DoK stores its
216-byte compact `.GAM` body followed by a `GBD1` derived combat tail in the
padding region and sets header flags bit 0, so consumers do not mistake it for
CoK. DQK `/Q` uses the same compact-tail contract for a transient roster: for a
DOS QSV it verifies the header party count against its duplicate word, starts at
the physical first record `0x40F`, and walks each variable tail (`0x1A1` fixed
bytes, `17 * itemCount`, 9-byte affect nodes, and a 6-byte null-pointer
terminator). Its embedded CCH projection begins eight bytes later at `0x417`;
loose QCH files expose that same CCH-style payload at offset 8. A malformed QSV
tail is rejected rather than byte-scanned for a plausible later record. The
import preserves visible names and derives HP, AC, THAC0, damage
dice, and combat movement from verified `CCHFORM.TXT` offsets without mutating
the source QSV/QCH bytes; GBBOOT mirrors those tails into GBPS v2 movement rows
so DQK QSV parties and native-created compact parties feed the same combat
side-count/movement contract. The tail contains deterministic current HP, max HP, final AC,
damage dice, inferred level, compact class, final THAC0, armor-derived movement,
and a combat condition word when flags bit 1 is set; caster class inference uses
the matching `.WIZ` memorized-spell sidecar when present, then falls back to
ability scores. For DQK QSV/QCH records, the compact class is a coarse combat
class derived from the item-use mask at CCH offset 183, with current-level slots
157..163 as fallback; the shipped `SAVGAMA.QSV` byte at offset 89 is zero for
all six heroes and is not used. On later DQK `/Q` imports, CCPARTY overlays any prior flagged
`_GBPARTY.GBP` state onto the fresh QSV read, so native combat HP, max HP, and
condition persist between native launches without writing back to
`SAVGAMA.QSV`. The `/Q` path also restores prior high-bit native rows after
selecting a QSV/QCH source, including when no source exists. If imported and
native rows together exceed six, CCPARTY rejects before replacing the prior
roster. CCCOMBAT consumes it when present and falls back to the older
placeholder import for tail-less compact GBPRs. A valid GBD1 tail with zero HP
now preserves zero HP and its maximum HP; it no longer enters the 24-HP fallback.
`ccparty-test.ps1` verifies six downed members remain unconscious and take no
combat actions, alongside a missing-tail control that retains the legacy maximum.
For DQK imports, CCPARTY reads current HP at physical record `+0x198` and
maximum HP at `+0x89` (its shifted view uses `+0x190` and `+0x81`). These
roles are established by the original healing writer's add/clamp sequence.
`ccparty-test.ps1` covers injured and zero-HP QSV/QCH imports, unsigned HP
200/220, cold reload, retained prior combat metadata, and short QCH rejection
before output truncation. QCH projection requires the complete 414-byte field
span; its source tail is not interpreted as QSV affect-list data.
Normal CoK `/E` opens CCPARTY's
`[B]egin` / `[C]reate` gate; `/E /X` and DoK `/E` perform the same load/merge
without waiting for input. CCPARTY's DOS buffered input reserves a byte for
Enter: one-letter choices use capacity 2 and names use capacity 16 for the
advertised 15 characters. DQK `/Q /M` permits Begin with an imported party;
an empty party rejects without waiting for input. Create reports that DQK
creation is unavailable. `/Q /C` rejects before
opening the output, because a complete DQK creator is not implemented.
Console input retains DOS line editing. Redirected input uses bounded reads:
CR and CRLF are accepted, overlong lines are drained and rejected, and EOF
or a read error exits without replacing the prior roster. Only the optional
LF following CR is discarded; embedded control bytes remain invalid names.
`ccparty-test.ps1` covers guest BIOS Begin input, uppercase/lowercase creation,
15-character names, overlength and malformed-name retries, multi-character
choice rejection, EOF at menu/name/class, exact source-row preservation,
argument-creation byte comparison, and cold reload in a new DOSBox process.
The creator accepts the six documented Krynn classes for CoK/DoK;
CoK writes the bounded 409-byte record fields already pinned from saves, while
DoK writes the verified compact name, ability, class-like, THAC0, baseline AC,
damage, icon-size, and morale offsets. Retail DoK imports now read HP from `.GAM`
byte 40: 95/102/78/52/58/53 for the six shipped records, replacing the prior
class/level/Con estimates 63/80/70/60/42/55. Byte 214 agrees in these undamaged
samples, which does not establish which store is current versus maximum HP;
the initial GBD1 HP/maxHP pair therefore uses byte 40. Native-created DoK
characters still derive their starting HP and write it to both stores.
`ccparty-test.ps1` checks those retail totals, unchanged source bodies, creation,
persistence, and six-member combat import. The retail expectations fail against
the former formula at slot 1. AC comes from verified `.JNK` armour/shield records, and readied
weapon damage plus supported weapon magic and Strength damage bonuses for the
verified Long Sword and Hoopak item types where present. DoK party movement is
derived from readied `.JNK` armor with native combat-cell values: unarmored 4,
Ring Mail 3, and Plate Mail 2.
Native-created entries use GBPR slot IDs `0x80` through `0x85` (zero-based
IDs), while imported source slots remain one-based. Creation selects the first
unused native ID in that range instead of deriving it from the total member
count, which can shrink when source saves change. Existing native IDs remain
unchanged. The reload validator
checks this range and rejects duplicate native IDs. On 2026-10-02 its mistaken
`1..6` native range was corrected: it had rejected the first created member
on the next `/R` request. `ccparty-test.ps1` exercises all six native slots,
cold reload, invalid and duplicate slot rejection, and unchanged rejected input.
Its reload checks require successful loading as well as byte preservation.
The 2026-10-02 preservation regression adds 95 checks across 15 isolated
headless runs: QSV/QCH imports retain synthetic native rows byte-for-byte,
six-source-plus-one-native and five-source-plus-two-native merges reject
without replacing the prior output, and CoK creation fills unused native IDs
after source membership shrinks. Source-only and exact-six controls, cold
reload, and wrong-title/legacy rejection remain covered. The previous binary
fails 13 of these checks; the repaired binary passes all 95. The synthetic
high-bit DQK rows test preservation, not a retail DQK creation implementation.
Native entries are merged from a prior sidecar with matching title and layout,
so they persist without changing the
original `SAVE` directory. The deterministic forms are `CCPARTY /C <name>
<C|F|R|K|M|T> <output.gbpr>` for CoK records and
`CCPARTY /G /C <name> <C|F|R|K|M|T> <output.gbpr>` for DoK.
Native camp entry is available from CCFP's walking loop with **C**; **X** or
Esc leaves camp. CoK camp offers **R** to rest eight hours. Five-minute ticks
advance the persisted clock; each 288 ticks heals eligible members by one HP,
caps at maximum, and wakes down/dying members without healing dead members.
The healing remainder resets on entering a new camp. Rest checks the area's
`0x7ED2/0x7ED3` encounter period/chance and dispatches CampInterrupted when
interrupted, carrying the native ECL RNG forward. HP/condition changes are written
to GBPR and original low-numbered saves. Imported CoK SFX durations also advance
during rest and CoK ECL CLOCK, with the callback limits described below. Spell
learning, combat-round effect timing and other titles' rest rules remain unimplemented.
`GBBOOT /E /2 [ticks]` exercises one headless
camp entry through CCFP `/M C`. Exit code 11 distinguishes camp from movement
exit 10 while the GBST packet retains the current pose. GBBOOT runs PreCampCheck
through CCECL `/2`, preserves prior ECL state, and avoids vmRun1, SearchLocation
and CampInterrupted. A halted pre-camp script fails instead of opening camp.
`gbboot-create-test.ps1` verifies this with independently marked synthetic CoK
hooks, unchanged pose and the halted-hook control. This proves the dispatch
boundary. Its rest fixtures compare 287/288 ticks, a capped member, down/dying/dead
states, whole saved-character bodies, clock/RNG persistence and a guaranteed
first-tick interruption. Headless rest is capped at 2880 ticks; omitting ticks
enters/leaves camp without resting. Interactive keyboard delivery and a full
retail rest encounter route are not claimed by these synthetic probes.
Current sweep: `gbboot-create-test.ps1` is PASS (2026-10-02).

CoK camp **S** saves `GREYBOX.GBS` in the current game directory. `GBBOOT /5`
restores that camp in a fresh native process, skipping title/party creation,
initial ECL and PreCampCheck. The checkpoint carries the complete native GBPR
party, GBEF v9 script memory/clock/RNG, map/archive identity, GBSN pose and both
rest counters. Leaving the restored camp resumes exploration; entering a new
camp resets healing credit as usual. This restores the native campaign state
currently implemented, not unimplemented retail systems or SSI save files.
The restored GBPR owns party state; merely loading does not rewrite source
character files. Subsequent rest/combat uses the existing writeback paths.

For headless verification, `GBBOOT /E /2 287 /4` saves after 287 ticks;
`GBBOOT /5 /2 1 /4` continues the same camp for one tick and saves again.
`GBBOOT /5 /X` loads and exits without advancing time; `/5 /T n` leaves the
restored camp for bounded exploration. `/4` saves only at a
completed camp boundary; an interrupted camp cannot be saved by that option.
**Corrected by the `dok-camp-rest-parity` item (2026-09-09): this used to read
"Other game profiles reject this CoK checkpoint version," and that is no
longer true for DoK.** `checkpoint_game_id` stamps offset 6 with 1 for CoK and
2 for DoK, and `checkpoint_validate` (shared by save and restore) checks the
saved byte against the CURRENT game's id rather than hard-requiring 1 -- so a
DoK checkpoint round-trips through `/4`/`/5` exactly as a CoK one does, and a
checkpoint saved under one game is correctly rejected when restored under the
other (proven by `gbdok-camp-rest-flow-test.ps1`'s wrong-game-id negative
control). Every other Gen1-family title still gets no checkpoint support at
all -- `is_gen1_rest_capable` is what the naming describes, CoK+DoK, not every
profile -- so "other profiles" narrows from "any non-CoK" to "any non-Gen1".
Use a writable game copy, as the existing launcher/staging helpers do.
Latest full flow sweep (2026-10-03): `gbdok-camp-rest-flow-test.ps1` is PASS. The stale v1 GBPR header check was updated to assert the exact DoK v2 identity/schema; the real-.GAM body, HP parity, and mutation controls passed.

The **GBCP v5** file has a 11112-byte core followed by owned inventory.
All integers below are little-endian:

| Offset | Content |
| --- | --- |
| 0 | `GBCP`, u16 version 5, u16 game id (1 CoK / 2 DoK -- **corrected 2026-09-09**, this row previously said "u16 game 1 (CoK)" as if that were the only legal value) |
| 8 | u16 ECL/GEO archive number 1–3, current ECL block, map block |
| 14 | u16 camp flag 1, healing credit (0–287), encounter counter |
| 20 | u16 actual GBPR length, GBEF length 5750, core length 11112, current cell descriptor |
| 28 | u32 standard CRC32 of the whole file with this field zeroed |
| 32 | 16-byte GBSN v1 pose |
| 48 | 5750-byte GBEF v9 state |
| 5798 | GBPR v1, padded with zeros to 2476 bytes |
| 8274 | u16 effect-ownership flag (0/1), then eight 32-byte member bitsets |
| 8532 | u16 timer-state flag (0=unknown legacy, 1=known), u16 record count (0–256) |
| 8536 | Eight source bytes: 0=none, 1=SAVE, 2=CLOUD_~1/SAVE |
| 8544 | Up to 256 ten-byte records (one-based GBPR owner + original nine-byte SFX node), zero-padded |
| 11104 | u8 rest-action active (0/1), u8 hourly phase (0–11), six u8 memorization countdowns (0–21) |

GBCP v1 (8274 bytes) and v2 (8532 bytes) remain readable. V1 has no ownership
snapshot; v2 preserves ownership but has no durations. Resaving either version
leaves timers explicitly unknown and does not infer them from changed sources.
V3 (11104 bytes) preserves timers but has no memorization phase. V1–v3 load with
an inactive learning action; the next rest calculates preparation rather than
inventing partial progress. V4 (11112 bytes) remains readable. New saves use v5. CoK effect ownership is imported after GBPR selection from
each selected low-numbered slot's SFX, with cloud SFX fallback; native-created
slots inherit no retail SFX. Whole nine-byte records are required. An imported
effect stays with its owner in FIND_SPECIAL, while CHECKPARTY queries the union.
The bitsets cover all 256 effect IDs for each of eight possible source members;
they avoid the old eight-party/four-member seed caps. Current playable GBPR
parties remain bounded to six members. Explicit `/F` party-wide and `/U` member
probe seeds retain their legacy behavior. An explicit `/F` bypasses SFX import.

SFX import retains duplicate ids, both flag bytes and all saved pointer bytes;
it rejects partial records and more than 256 records across the selected party.
Rest subtracts five from positive durations per completed tick. Zero is permanent;
durations of five or less expire. Query bits are rebuilt from surviving records,
so removing a timed copy cannot remove another permanent copy of the same id.
Completed rest rewrites each imported owner's SFX in its original source path,
including an empty file after the last effect expires. Retail loading rebuilds
links in file order, so surviving saved pointers remain opaque. This writeback
uses ordinary DOS file writes; the multi-file rest update is not atomic. The
last explicit camp checkpoint remains available if a rest write fails.

Expiry supports unapplied effects except ids 0x0C/0x0E/0x26, whose additional
retail removal callbacks remain unresolved. Applied haste (0x27) increments the
character age word at +96 only when node +3 bit 0x10 is clear. Applied slow
(0x2A) has no persistent character delta at removal. Their derived movement/
attack modifiers are not yet implemented. Other applied effects stop rest with
an effect-id message before the due tick; earlier completed ticks are retained.
Interactive camp stays open; headless rest reports failure. All due effects are
checked before any member changes. Spell application and complete
combat spell parity remain unimplemented.

`gbboot-create-test.ps1` checks independent full-byte timer/character expectations,
durations 0/1/5/6/10/65535, duplicate ids, both haste flags, applied slow, cold
restore after SFX deletion, post-expiry CCECL owner queries, callback preflight,
v1/v2 compatibility, malformed timer sections and the 256-record boundary.
Current sweep: `gbboot-create-test.ps1` is PASS (2026-10-02).

The compatible **GBPS v4** format is 540 bytes and carries affect ownership.
**GBPS v5**, 3128 bytes, adds the same
2572-byte timer block used by GBCP v3/v4, and eight u16 pending age increments.
V5 is a writable per-invocation exchange. CCECL updates ownership/timers and
age deltas after execution; GBBOOT consumes them, writes whole character/SFX
records, and clears the deltas before another invocation. Input deltas must
be zero. This exchange is independent of the camp learning extension and GBEF v9. CCECL still accepts
v1–v4 seeds; they do not invent missing durations. CoK GBBOOT now emits **GBPS
v6**, 3160 bytes, retaining that prefix and appending the 32-byte owned item-type
bitmap described below. Unknown timer state remains unknown, with a zero timer
section; known empty timers may coexist with an empty affect-ownership flag.

CoK ECL CLOCK now updates timers inside CCECL before its next instruction,
independently of the 64-event GBSX log. Selection, comparisons and GOSUB state
remain live; chained blocks retain durations. Slot zero and slot one use the
step byte directly. Higher slots multiply down clock radices, retaining the
low word of each product, as verified in CoK. Invalid slots do not advance
timers. A CLOCK requiring an unsupported expiry halts with GBHD reason 5 before
that instruction advances time or timers; earlier completed clocks survive.
GBBOOT reports the halt and retains the last explicit camp checkpoint.

CCECL's startup roster, seed and resume reads share decompression scratch.
The early resume read selects the block; a second read after decompression
restores the continuation. Live ownership and timers remain separate. This
frees room for in-VM timing while keeping the existing COM caps. CCECL is
63135 resident bytes with CoK lunar timing; GBBOOT is 59538 with rest learning
and lunar timing.
`ccecl-clock-effects-test.ps1`, called by the standing CCECL effects test,
checks synchronous queries, selection/comparison/call-stack state, transcript
overflow, timer units, chained blocks, duplicate ids, aging, legacy seeds and
eight malformed exchanges. The GBBOOT creation test covers host writeback,
cold continuation and the unsupported-clock checkpoint boundary.

CoK lunar phases now advance on each carry from hours into days, in both ECL
CLOCK and camp rest. The script-visible phase words are `0x4CF9..0x4CFB` and
counter words `0x4CFC..0x4CFE`. From counter zero the three phases last 9/2/7
day carries: retail compares against 8/1/6 before incrementing. A CLOCK that
adds directly to days or larger slots does not synthesize an hour carry. Sparse
script memory preserves these words through GBEF/GBCP without changing formats.
CCECL enables this only for a Gen1 input with a sibling `KRYNN.CFG` and no
`DKK.CFG`; other title profiles retain their own timing behavior. Missing lunar
words start at zero when the first day carry materializes them. This is not an
importer for retail Area1 saves or a moon-icon renderer.

Both paths preflight room for all six keys before an affected tick changes timers
or time. A full map halts ECL CLOCK with reason 3, or stops rest while retaining
the last explicit checkpoint. Existing lunar keys continue to work in a full map.
`gbboot-lunar-test.ps1`, invoked by `gbboot-create-test.ps1`, checks 14 ECL cases,
rest day boundaries, whole character records, VM/cold camp continuation, script
queries, transcript overflow, title scoping, timer preservation and full-map
failure. The pre-change CCECL fails its DAY query; pre-change GBBOOT fails R288.
The independent retail helper oracle is `tools/test_cok_lunar_clock.py`.
Current sweep: `gbboot-create-test.ps1` is PASS (2026-10-02).

CCECL also imports the CoK spell queue directly from each full GBPR body at
bytes 30–87. CoK SPELL returns the actual **zero-based slot and member**, scanning
all 58 raw bytes in roster order. Holes, repeated ids and pending high bits are
retained: a normal id does not match its pending counterpart. A miss returns
slot 255 and the last member index (zero for an empty roster). This behavior is
byte-pinned to CoK's own opcode handler; it is not a cast or consumption action.
Explicit `/S` and `/V` seeds retain their synthetic slot conventions, and DoK
compact records do not use these offsets. No new checkpoint/seed format is
needed because the queue is already part of the saved GBPR body. The standing
CCECL effects test includes retail, synthetic, reordered, empty, legacy and
DoK controls.

CoK rest now completes imported pending memorization entries. Starting a fresh
rest action computes four preparation hours, or six if a pending level exceeds
two. Each twelve ticks decrements character byte 88. Once preparation ends,
per-member countdowns use three ticks per level. Completion clears one pending
bit; look-ahead skips zero table levels exactly as the retail helper does.
The estimator alone treats zero levels as one. Whole GBPR/SAV bodies preserve
all other bytes, including ready duplicates and holes. ECL CLOCK does not learn
spells; this progression is specific to rest.

Interactive R starts another action and resets preparation/phase/countdowns.
`/5 /2 N` continues a checkpointed bounded action; it retains the saved phase
and countdowns. Encounter interruption occurs after learning for that tick,
and `/4` retains the previous explicit checkpoint when camp is interrupted.
V4 validates active/phase/count bounds and rejects simultaneous preparation and
countdown before restoring active files.

CoK camp **M** opens the memorization menu. Select a member, then a numbered
known spell; the list shows names and remaining allowance, with a pause every
twelve entries. Pending spell numbers are listed separately. Confirm with Y
to queue a spell, or use C and confirm to cancel that member's pending spells.
N declines without a write; X returns to camp. S saves the resulting camp.
Headless `/6 member spell` uses members 1..6 and spells 1..107; spell zero
cancels pending spells. Combine with `/E` for a fresh camp or `/5` to restore,
and `/4` to checkpoint, for example `GBBOOT /5 /6 3 9 /4`.

Admission uses the imported known flags and cached capacities, counting ready
and pending copies. It retains retail signed class-level checks, group-two
duplicate filtering (slots 1..57), byte-wrap arithmetic and spell 56's level-seven
capacity index. Mage admission includes the shared lunar allowance. Additions
fill the first empty slot and apply retail pairwise sorting; cancellation clears
pending bytes and preparation without sorting. Successful changes preserve the
other character fields and reset all eight saved learning-action bytes before
the next rest. Source SAV and active roster writes are sequential; explicit
camp checkpoint publication uses the existing temporary/backup procedure.

Invalid queue ids and full queues reject additions. One undefined retail branch
also rejects: group-two capacity for an inactive cleric depends on prior stack
contents. The native menu reports unavailable instead of deriving an allowance
from that incidental value. The menu does not rebuild imported character
capacities or import retail lunar saves. Native CoK creation does establish the
retail capacity-producer's level-one cache: every offered class has its matching
class-level slot, the camp-active byte is set, a cleric has three level-one slots
and known spells 1/3/5/6/8, and a mage has one level-one slot and automatic known
spells 11/12/15/18/21. An isolated retail `START.EXE` creation run reaches save
without a spellbook-selection prompt and persists those five mage flags; its
level-two record has two mage slots, while native creation intentionally remains
level one. Scribing remains supported only through owned inventory.

`gbboot-memorization-test.ps1`, called by the creation/camp test, checks 32 DOS
cases including three interactive confirmation paths using in-DOS BIOS input.
It compares complete source/checkpoint bodies and checks cold learning,
cancellation, lunar-pool exhaustion and replacement of an active countdown.
`tools/test_cok_memorization.py` independently executes the original eligibility,
sort, cancellation and capacity helpers and pins the embedded spell metadata.

Rest completes queued scroll scribing from owned inventory, imported from each
selected member's complete 63-byte STF records with per-owner cloud fallback.
Pending scrolls (item ids 39/40, bytes 60–62 above 128) precede memorization,
sharing its completion flag and countdown. Completion updates the known spell,
clears the last matching slot, decrements charges with byte wrap, and removes
records below 100 charges. Invalid queue ids and partial inventory records stop
rest before time or party changes. Native-created identities inherit no retail STF.

`CCINV.COM` streams inventory through a 4096-byte buffer, preserving every
record byte and owner/order identity without a 256-node cap. GBCP v5 appends
GBIV v1 at 11112: a 16-byte header (magic, u16 version, u16 owner count,
u32 total length, u32 reserved zero), followed by each owner's eight-byte row
(u8 source id, u8 flags, u16 reserved zero, u32 byte length) and its records.
Flags distinguish absent (0), SAVE (1) and cloud (3), including present empty
files. Sources must match the unique GBPR roster ids in order. Lengths use
32 bits, bounded below 2 GiB by DOS signed seeking. The checkpoint CRC covers
the entire file. The fixed core is validated before staged inventory activation.

V1–v4 checkpoints import current STF files because they contain no inventory;
v5 restores saved inventory even when external files have changed. Rest exports
consumed inventories to their recorded SAVE/cloud STF paths, staging all changed
files before publication and attempting rollback on a later rename failure.
SAV, SFX, STF and checkpoint writes are not one cross-file crash transaction.
CoK FIND_ITEM now uses all owned inventory types through GBPS v6. CCINV's
`Q inventory roster seed` validates GBIV against the selected GBPR, scans every
record, then stages and publishes the v5 seed prefix plus a 32-byte bitmap.
Type `n` uses byte `n / 8`, bit `n % 8`; types 0 and 255 are included. This
represents all possible byte-sized types without a record or unique-type cap.
The map is refreshed after scribing and on checkpoint reload, so stale legacy
seed types and altered external STF files cannot override owned inventory.
Explicit diagnostic party-count seeds remain independent of the roster's
inventory membership. Existing v1–v5 seed behavior remains available.

Owned CoK DESTROY_ITEMS now runs through GBBOOT for the verified removal callbacks.
CCECL emits a checked inventory yield, and GBBOOT constructs GBMB v2 with current
paths, learning state and a completed host DAMAGE watermark. It runs CCINV B/M,
CCECL CHECK, CCINV C and CCECL MUTATE in that order. Consecutive removals and a
removal after the host's empty-combat handoff resume through the same path.
Movement is refreshed before the host rewrites the seed; inventory, owned effects
and timers persist into cold checkpoints. Missing owned-effect metadata and
unsupported applied callbacks still stop before activation. General callback
coverage, including applied effect 7's combat context, remains incomplete.
[`cok-mutation-output-ownership.md`](../docs/engine/research/cok-mutation-output-ownership.md)
(2026-09-08, handoff task 2; hook-point decision and scoped native
implementation added 2026-09-09) defines the versioned `GBOC` RNG/damage
output-ownership record. `tools/cok_mutation_output.py` remains a conservative
Python reference model with an empty `AUTHORIZED_OUTPUT_CALLBACKS`; it does
not define the native authorization boundary. GBMR v3 now carries its 40-byte
GBOC record through the real `CCINV M` request/response envelope, where
`cokmutation.inc` supplies `cm_gboc` only to the matching owner and
`cokremove.inc` validates and applies the single-owner effect-7 output.
`tools/cok_native_mutation.py` drives accepted and rejected v3 requests through
DOSBox. The scope remains narrow: only target ordinal 1 and prior status zero
are authorized; broader callback coverage and combat contexts remain open.
See the design doc's dated GBMR v3 section for the wire contract and limits.

The host fixture covers 12 DOS cases and four cold reloads: single/consecutive
removals, a post-combat removal, an applied effect with nested marker deletion,
changed-source rejection, unavailable effect metadata and all six publication
rename failures. It checks earlier HP damage once, subroutine return, comparison
flags, RNG draws/state, clock, movement and FIND_ITEM. An independent surviving
effect and timer remain after cold reload. The helper fixtures also cover 75
constructor controls, 35 checked continuations, 32 continuation rejections,
39 activation controls and 130 standalone M cases (two added 2026-09-08: real
`CCINV.COM` rejects an applied kind-7/id-7 removal and accepts the same id
unapplied, the DOSBox-verified counterpart of the effect-7 boundary above).
On 2026-10-02, the continuation gate exposed and fixed a shared-buffer overrun
in active-roster validation. CCECL now compares the roster in bounded chunks
after the largest GBMR header and probes EOF separately. A NASM assertion
checks that the header plus scratch fits the compressed-input buffer. The three
new rejections cover both sides of a chunk boundary and the final roster byte.
CHECK or activation failure now skips dependent fixture stages and records
the affected case instead of attempting a continuation with invalid state.
The call-stack rejection fixtures now use depth 33 (above capacity 32), or
depth one with an explicit return before the Gen1 header or past block end.
A depth-one mutation alone can be valid when an unused saved slot happens
to contain an in-range return address; rejection must not depend on it.
Existing helper stage/backup files are preserved; ordinary publication
failures roll back completed renames. Backups remain recoverable if rollback
fails. This is not power-failure atomicity.

CoK CHECKPARTY uses the original 7C00h selector base, verified by original-handler
execution; generic profiles retain their existing encoding. GBMR/GBIY v2 preserve
execution counters, loaded-block CRC, comparisons and selection. See
[`cok-mutation-packet.md`](../docs/engine/research/cok-mutation-packet.md).
`ccinv-item-query-test.ps1` checks 21 seed/publication cases, 2048 DOS queries
covering all six comparison flags, eight invalid v6 seeds and deletion halts.
`gbboot-item-query-test.ps1` checks consumed/retained scroll queries and cold
ownership despite changed external STF files. Both run in the creation/camp suite.
`tools/test_cok_item_query.py` executes the original FIND_ITEM and operand
readers in 44 cases, with two code/data mutation controls.
`ccinv-test.ps1`, invoked by the creation/camp test, checks
21 DOS helper cases including exact records, >64 KiB checkpoints, malformed
inputs, legacy migration, failed-import preservation and SAVE/cloud precedence.
The memorization test checks cold rest after an external pending scroll appears.

`ccinv-learning-test.ps1`, invoked by the creation/camp test, checks 205 DOS
helper cases: exact learning packets and inventory stages, charge/slot boundaries,
preparation wrap, owner isolation, offsets above 64 KiB, invalid inputs and
SAVE/cloud publication failures. `tools/test_cok_learning.py` checks packet
integrity and both embedded level tables against original bytes.

`gbboot-learn-test.ps1`, invoked by the creation/camp test, checks 23 DOS cases,
eleven cold continuations and six valid-CRC malformed learning states. Three
additional cases check blocked timer expiry before scroll activation, failed
request I/O, and preservation of healing/haste aging during scribing. It includes
hour/level boundaries, zero levels, slot 57, exact bodies, post-rest SPELL queries,
scroll preflight/cloud fallback, encounter ordering and v3 migration. The old
executable fails the same fixture on missing preparation at character byte 88.

Load verifies length, CRC, section versions/counts, camp status, clock radices,
slot identities and pose bounds before replacing active party/ECL/pose files.
It decodes the selected GEO and checks dimensions against the saved pose.
Save writes and closes `GREYBOX.TMP`, renames the previous save to
`GREYBOX.BAK`, then publishes the temporary file. A publish failure attempts
rollback; the backup remains available if rollback also fails. DOS renames
are not a filesystem transaction: after power loss between renames, recover
the previous complete save by copying `GREYBOX.BAK` to `GREYBOX.GBS`.
Active scratch-file replacement during load is also sequential; on an I/O
failure, fix the destination and load the intact checkpoint again.

`gbboot-create-test.ps1` runs cold DOS processes with poisoned initial/pre-camp
entries, checks exact save/load/save bytes, partial healing and encounter
counters, previous-save backup, failed temporary writes, and invalid checkpoint
rejection without changing active state or source saves. These are synthetic
campaign-state tests; full retail campaign completion remains unproven.
Current sweep: `gbboot-create-test.ps1` is PASS (2026-10-02).

GBBoot also exposes that path as repeatable `/R <name> <C|F|R|K|M|T>` requests
during `/E`; it passes each create request through CCPARTY, skips the blocking
party menu, refreshes GBPS from the resulting GBPR, and continues into
ECL/rendering. `gbboot-create-test.ps1` pins this with a save-less CoK data
fixture, three native members created by one GBBOOT invocation, and a second
headless launch that reloads the native GBPR and takes a bounded persistent
SearchLocation step through dialogue and combat/resume. The combat leg now
asserts the native high-bit member identity remains intact while `GBCR` writes
current HP, and victory XP when present, back into the GBPR rows. Separate
synthetic noncombat ECL legs now prove automatic party-wide and selected-member
no-save `DAMAGE` records from `GBSX` subtract HP from the intended
native-created GBPR rows before the next snapshot. A stale-selection regression
leg also proves a failed `LOAD_CHARACTER` clears the exported selected-member
context, so a later selected/no-save `DAMAGE` record is preserved in `GBSX` but
does not mutate the previously selected GBPR row. The same Gen1
GBPR authority is also exercised against real CoAB area-2 ECL/GEO/WALLDEF/8X8D/
MON data by `gbcoab-flow-test.ps1` (**was RED as of 2026-09-05 and red before that round; that red run ENDED on 2026-09-10 -- two controlled 30-script sweeps that day, 28 PASS / 2 FAIL with ZERO status changes and byte-identical needles between them, both record PASS**). The broader synthetic combat handoff smoke
now exercises the same `/R -> GBPS -> CCCOMBAT /P -> GBCR -> GBPR` path for
Pool, Secret, Gateway, Treasures, Pools of Darkness, Buck Rogers Countdown, and
Matrix Cubed profile markers. `gbbroader-flow-test.ps1` (**PASS in the clean-source
2026-09-08T04:07:36Z sweep at `5c1ac4c`**) keeps that
same profile set in the normal headless `-FlowOnly` gate: each synthetic fixture starts from
the `/J` title front door, records the title helper invocation, creates a
three-member native party with `/R`, refreshes GBPS, and proves the separate
`CCECL -> CCCOMBAT -> GBCR` tactical bridge still runs, writes a nonblank
tactical RAW frame, and avoids writing combat traces into the game directory.
Its previous failure came from applying Krynn title bands to the other Gen1
profiles; the profile guard fixes the engine without changing this test's pins.
Current sweep: `gbboot-create-test.ps1` is PASS (2026-10-02).
Current sweep (2026-10-04): `gbcoab-flow-test.ps1` is PASS; the CoAB B51 resume and natural area-2 continuation both complete with the validated CCFLOW terminal GBSL sidecar.
Latest full flow sweep (2026-10-03): `gbbroader-flow-test.ps1` is PASS; the 2026-10-02 missing-output failure is resolved.

After the party gate, GBBoot validates GBPR and refreshes GBPS from verified
GBPR fields. The roster count is authoritative, DAX-family Gen1 GBPR bodies
refresh the v2 thief-skill matrix from `.SAV` bytes **219..226**, and DoK GBD1
tails refresh movement seeds plus derived v2 thief-skill matrix rows from the
compact-party metadata. This makes
a GBPR-only party authoritative for ECL queries and the CCCOMBAT handoff instead
of relying on the presence of original saves. GBBoot also passes the GBPR path directly to
CCECL with `/B`, so future roster-backed ECL fields can be imported without
expanding the compact GBPS bridge. An empty roster is represented by a valid
zero-count GBPR rather than by a missing file.
`gbdok-flow-test.ps1` pins the real DoK front door: `GBBOOT /E /X` creates a
flagged compact-party GBPR, feeds count 6 plus GBD1 movement rows into GBPS,
executes ECL, and writes a 320x200 first-person snapshot headlessly. It also
seeds a known area-1 pose and runs `GBBOOT /E /T 1`, proving the same bounded
persistent step-yield loop reaches a DoK SearchLocation text event and exits
cleanly after the host-facing script effect instead of reporting a post-text
packed-data byte as a VM halt. `gbdok-create-test.ps1` pins the save-less
native-created equivalent: repeated `/R` requests create compact high-bit GBPR
members with GBD1 tails, refresh GBPS count plus movement rows, persist
byte-for-byte across a later no-`/R` launch, and take the same bounded DoK
SearchLocation step.
Current sweep (2026-10-04): `gbdok-create-test.ps1` and `gbdok-flow-test.ps1` PASS after the shared GameLink helper waits for DOSBox-X teardown.

### DoK camp/rest parity (`dok-camp-rest-parity`, 2026-09-09)

DoK's entire camp subsystem -- camp entry, the eight-hour Rest, checkpoint
save/restore, and rest-encounter interruption -- was gated off by scattered
`cmp word [gamep], game_cok` checks in `native/src/gbboot.asm`, even though
nothing about the *shared* Gen1 camp/rest mechanics is CoK-specific: both
games export the same 410-byte GBPR record shape (`ccparty.asm`) that
`load_cok_camp_state`/`run_cok_rest`/`checkpoint_store`/`checkpoint_restore`
actually read. The fix consolidates the 5 call sites that previously compared
`gamep` directly into one shared predicate, `is_gen1_rest_capable`
(`cmp word [gamep], game_cok` / `je .yes` / `cmp word [gamep], game_dok` --
CoK or DoK, nothing else), plus a `checkpoint_game_id` helper (1 CoK / 2 DoK)
so a saved checkpoint records and re-checks which of the two games it belongs
to instead of assuming CoK.

**That consolidation alone did not work, and finding out why is the point of
this writeup.** Running an actual DoK `/2`-headless rest+save (not just
reading the source) surfaced FOUR MORE independent rejects on ccparty.asm's
FLAG_DOK word (GBPR body offset 10, 0=CoK/1=DoK) that the original
`cmp word [gamep], game_cok` text search never found, because none of them
match that pattern -- they read the roster's own self-declared shape flag
instead of the game selector:

1. **`load_cok_camp_state`** re-checked FLAG_DOK itself immediately after
   `is_gen1_rest_capable` had already admitted DoK, silently re-narrowing the
   function back to CoK-only (`test word [rest_party+10],1 / jnz .fail`).
   Relaxed to accept both values -- nothing below that point in the function
   reads the flag.
2. **`checkpoint_validate`** (shared by `checkpoint_store` and
   `checkpoint_restore`) hard-required FLAG_DOK==0 in the saved roster
   (`cmp word [rest_party+10],0 / jne checkpoint_bad`). Relaxed the same way;
   the per-member loop immediately below only reads the leading slot byte
   (game-agnostic, per ccparty.asm's own "original slot byte" header comment)
   and the body's byte 0 (name length -- confirmed identical convention for
   both games: DoK's compact `.GAM` body has "0/1..15 = name length + ASCII"
   at the same offset CoK's CCH body does, per
   `docs/engine/research/dok-chrdata-save-format.md` section 2.1).
3. **`ccinv.asm`'s `open_core`** (used by CCINV's checkpoint-store/-load
   modes 'S'/'L') hard-required the checkpoint's own game-id byte (the one
   `checkpoint_game_id` writes) to equal 1, rejecting DoK's 2 outright.
4. **`ccinv.asm`'s `owners:`** -- shared by FOUR CCINV modes ('I' import,
   'S'/'L' checkpoint store/load via `open_core`, 'Q' query, 'R' learn) --
   validates the same GBPR header shape (embedded checkpoint-core copy for
   'S'/'L', a plain roster file for the other two) and rejected FLAG_DOK==1
   for all of them. **Relaxing it unconditionally was tried first and is
   wrong**: it regressed `gbboot-create-test.ps1`'s negative learning
   fixture `C0185` (`native/learning-fixtures.py` mutates this exact word to
   1 inside a scroll-learning request and asserts CCINV rejects it, matching
   `tools/cok_learning.py`'s independent reference model, which requires the
   roster's flags word to be exactly 0 for `'R'`/learn_mode -- see the
   scroll-scribing-stays-CoK-only note below). Caught by running the full
   flow sweep, not by inspection. The shipped fix reads the shared `[mode]`
   byte and accepts FLAG_DOK==1 only for `'I'`/`'S'`/`'L'`; `'Q'` and `'R'`
   remain strictly CoK-only.
Current sweep: `gbboot-create-test.ps1` is PASS (2026-10-02).

None of these four is optional or a rubber stamp: reverting #1+#2 together
(with the other fixes left in place) reproduces the exact original symptom --
DoK rest never prints "Rest iterations" at all. Reverting #3+#4 together
reproduces a *second*, different symptom hit during development -- DoK rest
completes all 300 ticks, then checkpoint save fails with CCINV's own
"Inventory could not be loaded or saved." and no `GREYBOX.GBS` is written.
Both reverts were assembled and run by hand against the real DoK fixture
before being accepted as genuine gates; see the header comment of
`gbdok-camp-rest-flow-test.ps1` for the exact before/after transcripts.
Latest full flow sweep (2026-10-03): `gbdok-camp-rest-flow-test.ps1` is PASS. The stale v1 GBPR header check was updated to assert the exact DoK v2 identity/schema; the real-.GAM body, HP parity, and mutation controls passed.

**One thing was deliberately NOT widened: scroll scribing during Rest stays
CoK-only**, matching the pre-existing memorization precedent. `rest_learn_tick`
unconditionally reads per-character body offset 88 every rest tick (via
`.ordinary_learning`, whenever no scroll-learning plan is active) and
decrements it as a scribing-progress counter. For DoK, body offset 88 is real,
populated retail character data (within the 0..215 range `.GAM` actually
uses), not always-zero padding -- so treating it as a scribing counter would
silently corrupt or misinterpret genuine DoK data. `rest_learn_prepare` (the
only place that plans new scroll-learning) and `rest_learn_tick` both stay
gated on `cmp word [gamep], game_cok`, and `rest_learn_needs_plan` already
safely no-ops once `learn_scroll_mask` is never set. This mirrors the
project's `goldbox-golden-cannot-adjudicate-its-own-code` /
"a shared code path a title has never been exercised on is not a capability"
standard: a gate flip that looked plausible from reading the source alone
would have produced confidently wrong DoK results.

### DoK Rest real-`.GAM` parity (`dok-rest-real-gam-parity`, 2026-09-09)

The write-up directly above this one shipped `rest_heal_party` with a
justification that turned out to be **false in one of its three claims, and
untested against real character data.** Both defects are corrected here,
established from the retail bytes rather than assumed, per the six shipped
`Death Knights of Krynn/SAVE/CHRDATA{1..6}.GAM` pregens (measured directly,
not inferred).

**Defect 1 -- the "always-zero padding" claim was true for two of the three
offsets `rest_heal_party` reads, and false for the third.** The corrected,
byte-verified facts:

- **Offsets 392 (status) and 407 (HP, also the write target) ARE genuinely
  always-zero padding for DoK.** DoK's GBPR body is `ccparty.asm`'s 216-byte
  real `.GAM` record (bytes 0..215) followed by a `GBD1` combat tail
  (`DOK_META_OFF equ DOK_CHAR_SIZE` = 216). `DOK_META_MAXHP+2` ends at 244,
  and the DoK AWARD_XP cache occupies bytes 244..275; `clear_charbuf`
  zero-fills the full 409-byte `CHAR_SIZE` buffer before either region is
  populated, and nothing writes bytes 276..408
  for a DoK member. 392 and 407 both fall inside that untouched tail, so the
  original claim was correct for these two.
- **Offset 98 is NOT padding -- it is real, populated retail `.GAM` data.**
  Byte 98 falls inside the 0..215 real-body range, and reading it directly
  from all six shipped pregens gives **83, 83, 42, 113, 42, 113** --
  non-zero and varying, which falsifies "always-zero" outright. (`byte
  90..109` was dumped as a wider context window for all six files during
  this item's verification; `docs/engine/research/dok-chrdata-save-format.md`
  section 2.4 independently corroborates that this range is
  "unmapped-but-populated," not padding, and separately warns that
  "'PC-only scratch' is too broad" for this exact byte span.)
- **The justification that actually holds, verified by auditing every other
  consumer of body offset 407 in this codebase:** all four are explicitly
  DoK-gated -- `gbboot.asm`'s combat-writeback `.dok_patch` sites (twice),
  `cccombat.asm`'s `cmp byte [party_dok],0 / jne .dok_stats`, and
  `ccparty.asm`'s `cmp byte [dokmode],0 / jne .good_done`. **No DoK-aware
  consumer anywhere in this codebase ever reads body offset 407 as an HP
  field**, so `rest_heal_party` writing a stale value there was harmless by
  observation, not by the offset being unused memory.

**Decision: gate `rest_heal_party` on `rest_party+10` (FLAG_DOK), rather than
leave the write in place under the corrected comment alone.** Both were
considered. Leaving the write in place costs 0 bytes but leaves a landmine:
"no current consumer reads it" is a claim about today's callers, and the
very next `cccombat.asm`/`ccparty.asm`-style DoK consumer of offset 407 would
silently inherit `rest_heal_party`'s garbage. Gating matches the file's own
established convention for this exact buffer (`load_cok_camp_state`,
`checkpoint_validate`, and now `rest_write_party` below all gate the same
word). The gate assembles to **7 bytes** (`cmp word [imm16],imm8` = 5,
`jne rel8` = 2); the resident image moved 64,843 -> 64,849, the 1-byte
difference being image rounding rather than a smaller instruction pair.
(437 -> 431 bytes of headroom under the 65,280 ceiling), measured via
`native/build.ps1 -Target gbboot`. Seven bytes to remove a whole class of
future regression is the right trade at 431 bytes of remaining headroom.

**Defect 2 -- the existing test could not fail against the case that
matters, and closing that gap surfaced a second, independent, load-bearing
bug.** `gbdok-camp-rest-flow-test.ps1` asserted bytes 392/407/98 stay zero
using a freshly-created (`/R`) DoK party, where they are zero *by
construction* -- that assertion cannot fail against a real character whose
byte 98 is never zero. The script now also runs a REAL retail
`CHRDATA{1..6}.GAM` party (not `/R`) through the same camp/rest path and
asserts `DOK_META_HP`/`DOK_META_MAXHP` -- the fields a DoK-aware consumer
actually reads -- are unchanged, and that all six 216-byte bodies remain
byte-for-byte identical to their retail source, including byte 98 equalling
its real non-zero value. Doing this surfaced a SECOND, unrelated, load-bearing
defect that had nothing to do with `rest_heal_party`:
Latest full flow sweep (2026-10-03): `gbdok-camp-rest-flow-test.ps1` is PASS. The stale v1 GBPR header check was updated to assert the exact DoK v2 identity/schema; the real-.GAM body, HP parity, and mutation controls passed.

- **`rest_write_party` unconditionally attempted a CoK-shaped `.SAV`
  writeback for any DoK member too, and this -- not `rest_heal_party` --
  was the actual blocker.** After writing the roster back to
  `_GBPARTY.GBP`, `rest_write_party` loops every member whose record-header
  slot byte is 1..6 and reopens `SAVE\CHRDATA<slot>.SAV` for update with
  that member's 409-byte body ("original low-numbered saves receive the
  same body," a CoK compatibility path), with **no FLAG_DOK gate at all**. A
  real DoK party imported from `CHRDATA{1..6}.GAM` carries exactly those
  slot tags (1..6, from the `.GAM` filename numbering CCPARTY assigns on
  import), so this loop tried to open an update handle on a
  `SAVE\CHRDATA1.SAV` that has never existed for DoK -- DoK's own retail
  save is the `.GAM` the body already came from. The open fails,
  `rest_write_party` returns carry, and `run_cok_rest` fails **silently**,
  before its own "Rest iterations" report line -- which is why a real DoK
  rest's DOSBox transcript went straight from `Camp`/`X - Leave camp` to the
  generic top-level "native preview failed" with nothing printed in
  between. **A `/R`-created DoK party never exercises this path**, because
  `setcreate`'s synthetic members carry the native high-bit slot convention
  (see the comment above `.saves:`), never a real 1..6 tag -- exactly the
  class of gap Defect 2 exists to close. Found by instrumenting a throwaway
  diagnostic copy of `gbboot.asm` with marker prints around every silent
  `jc`-to-`.fail` site in `run_cok_rest`'s persist chain (never committed;
  the real source file was untouched during that diagnosis, verified by
  SHA-256). Fixed the same way as `rest_heal_party`: gated the whole
  `.saves:` loop on `rest_party+10`, leaving the unconditional
  `_GBPARTY.GBP` roster write (both titles' actual persistence mechanism)
  untouched. Cost: an identical 7-byte gate -- resident image 64,849 ->
  64,857 bytes (431 -> 423 bytes of headroom). The two gates therefore
  assemble to 14 bytes total, matching the 64,843 -> 64,857 aggregate;
  the uneven +6/+8 per-step resident deltas are rounding, not cost.
- **Differential proof this was pre-existing, not a regression from the
  `rest_heal_party` gate above:** the identical real-`.GAM` fixture was run
  against an assembly of `git show HEAD:native/src/gbboot.asm` (this item's
  own unmodified starting point, before either gate existed) and failed
  with the byte-identical "native preview failed" transcript, confirming
  the `rest_write_party` defect pre-dated this item.

With both gates in place, the real-`.GAM` fixture completes all 300 rest
ticks, saves a checkpoint, and the parity check passes: all six 216-byte
bodies byte-identical to retail source (including byte 98's real value),
`DOK_META_HP`/`DOK_META_MAXHP` unchanged on all six real members. The check
was then shown able to fail: a mutant that removes `rest_heal_party`'s gate
and redirects its HP write to `DOK_META_HP`'s own low byte (offset 222)
turns the check red (`entry 0 DOK_META_HP changed (want 95 got 1)`), and
restoring `native/src/gbboot.asm` -- verified byte-identical throughout by
SHA-256, never by `git checkout --` -- turns it green again against the
same shipped binary. Total combined byte cost for both gates: resident image
64,843 -> 64,857 bytes (14 bytes), 437 -> 423 bytes of headroom remaining
under the 65,280-byte ceiling.

**Two more pre-existing findings, reconfirmed unaffected by this item's
fixes** (both already true before this item and both re-verified by
`gbdok-camp-rest-flow-test.ps1`'s finding-check):
Latest full flow sweep (2026-10-03): `gbdok-camp-rest-flow-test.ps1` is PASS. The stale v1 GBPR header check was updated to assert the exact DoK v2 identity/schema; the real-.GAM body, HP parity, and mutation controls passed.

- **Memorization stays CoK-only, correctly, though one supporting detail in
  this bullet was also overstated and is corrected here.** `mem_select_member`
  rejects every DoK member via its status/active bytes (record offsets
  392/393), which -- like `rest_heal_party`'s 392/407 above -- genuinely are
  always-zero padding for DoK. The functional conclusion (every DoK member
  reads `active=0` and is uniformly rejected) holds on that basis alone. The
  previous text additionally claimed the spell-queue fields at body offsets
  30..298 are "likewise always-zero padding," which is **false** for the
  30..215 portion of that range: those bytes are real, populated retail
  `.GAM` data (the same 0..215 real-body region byte 98 lives in above), not
  padding. That inaccuracy did not change the outcome here, because
  `mem_select_member`'s rejection never depends on the spell-queue bytes --
  it returns on 392/393 first -- but it would matter if anything ever read
  those spell-queue fields for a DoK member without the same 392/393 guard.
  `.camp_mem_check`'s own `cmp word [gamep], game_cok` keeps the `M` menu
  option, and the `.camp_mem_key` handler, CoK-only.
- **FIND_ITEM's real-inventory path is structurally unreachable for DoK, not
  silently wrong.** CCINV's owned-inventory files are hardcoded to CoK's
  `SAVE\CHRDATA{n}.STF` naming, and `write_seed_sidecar`'s item-bitmap 'Q'
  import (the only thing that ever raises the GBPS seed version to 6, the
  version FIND_ITEM's real-owned-item bitmap needs) is explicitly gated
  `cmp word [gamep], game_cok`, untouched by this item. A normal DoK boot
  stays at GBPS v2, confirming the legacy `/I`-only FIND_ITEM path is what
  DoK actually exercises -- inert, never incorrect.

**Acceptance, verified end to end with DOSBox 0.74-2 against real DoK
`GEO1.DAX`/`WALLDEF1.DAX`/`8X8D1.DAX`** (`gbdok-camp-rest-flow-test.ps1`,
added to `native/test.ps1`'s `$flowScripts`): the camp menu gates R/S on
`is_gen1_rest_capable` and keeps M CoK-only (source-level, since the headless
`/2` path never prints the interactive menu); a 5-site source mutant reverting
`is_gen1_rest_capable` back to the original CoK-only checks FAILS DoK camp/
rest/checkpoint exactly as pre-fix code did, and the shipped binary PASSES
the same fixture (300 rest ticks, `Camp saved to GREYBOX.GBS`); a DoK
checkpoint round-trips through `checkpoint_restore` with byte-identical
`rest_fx`/`rest_party`/session-pose files; a checkpoint stamped with the
wrong game id is rejected on restore; and CoK's FIND_ITEM finds a real,
non-`/I`-seeded STF-owned item while DoK's own boot is shown never reaching
GBPS v6 at all.
Latest full flow sweep (2026-10-03): `gbdok-camp-rest-flow-test.ps1` is PASS. The stale v1 GBPR header check was updated to assert the exact DoK v2 identity/schema; the real-.GAM body, HP parity, and mutation controls passed.

**Byte budget.** `gbboot.com` was 64,547 bytes emitted / 64,803 bytes
resident before this item (ceiling 65,280); the 5-site `is_gen1_rest_capable`
consolidation plus `checkpoint_game_id` brought it to 64,577/64,833; this
session's 4 additional gbboot.asm fixes (load_cok_camp_state,
rest_learn_prepare, rest_learn_tick, checkpoint_validate) bring it to
**64,587 bytes emitted / 64,843 bytes resident -- 437 bytes of headroom**.
`ccinv.com`'s pristine pre-item baseline was 35,041 bytes emitted / 53,809
bytes resident; two relaxations (`open_core`'s checkpoint game-id check, and
`owners:`'s roster FLAG_DOK check) moved it to **35,073 bytes emitted /
53,841 bytes resident**, comfortably inside its own 65,280 ceiling. The
`owners:` relaxation is scoped by the shared `[mode]` byte to only the three
CCINV modes that need DoK acceptance (`'I'` import, `'S'` checkpoint store,
`'L'` checkpoint load) -- an unconditional relaxation was tried first and
regressed `gbboot-create-test.ps1`'s negative learning fixture `C0185`
(`native/learning-fixtures.py`, which mutates this exact roster flags word to
1 inside a scroll-learning request and asserts CCINV rejects it, per
`tools/cok_learning.py`'s independent reference model requiring the roster's
flags word to be exactly 0 for `'R'`/learn_mode and `'Q'`/query_mode); the
scoped fix keeps those two modes CoK-only and was re-verified against a full
flow-suite sweep, not by inspection.
Current sweep: `gbboot-create-test.ps1` is PASS (2026-10-02).

`gbcoab-flow-test.ps1` (**was RED as of 2026-09-05, red before that round, and still red as of
the 2026-09-10T17:00Z sweep; that red run ENDED later on 2026-09-10 and it now PASSES**) turns on
its stage 2 (`GBBOOT /E /X /A 5 /B 51`, the Dracandros block). It pins `GBSX count=0037`; the
engine emits `GBSX count=0037` (55 retained ECL script records), and the two now agree.
Current sweep (2026-10-04): `gbcoab-flow-test.ps1` is PASS; CCFLOW publishes the completed flags=0120/GBSL result and the natural continuation passes.

**This paragraph was internally contradictory until 2026-09-10 and is worth keeping as an
example.** It asserted the script **FAILS at its stage 2** in one sentence and then, in the next,
that the pin and the engine both read `GBSX count=0037` -- i.e. it carried its own disproof two
lines apart. The stale half was left behind by `f05f57b`, which re-measured the pin from the
clamped `0010` to `0037` but could not know how far the script would get afterwards, because no
sweep had run since. `CLAUDE.md` flagged exactly that as the open question ("what is unknown is
how far the script gets once that first mismatch is gone"). Two controlled sweeps on 2026-09-10
answer it: all the way to a verdict. R3 attributes the 16 -> 55 move to the 2026-07-25 series around
`5871cc6` (`SCRIPTCAP 32` -> `64`) but explicitly did **not** bisect it, so the cause is a
lead rather than a finding. The `/B 53` leg and the natural area-2 bar-brawl ->
`CCCOMBAT` -> resume proof described below never execute.

**PIN CORRECTED 2026-09-10 (`f05f57b`); the paragraph above previously read "It pins
`GBSX count=0010`; the engine now emits `GBSX count=0037` (16 -> 55 retained ECL script
records)", which was true when written and stopped being true that day.** The 16 was never an
event total. At that time `GBSX count=` saturated: `fx_script_count` (`src/ccecl.asm`) was only
incremented behind `cmp ax, SCRIPTCAP` / `jae`, `dump_gbsx` (`src/ccefx.asm`) validated rather
than clamped, and nothing marked a truncated trace. The printed number was
`min(real_events, SCRIPTCAP)` and a pin written against it silently recorded the
CEILING whenever the trace overflows. With `SCRIPTCAP` at 16 on 2026-07-15 and 64 today, the
old `0010` was exactly that. The 55 is a re-measurement in DOSBox that REPRODUCES the value
this section already carried, not an independent second source for it. R3's `5871cc6` lead is
corroborated in mechanism by the saturating counter but is still not bisected, and this edit
ran no DOSBox session of its own. What is unchanged is the verdict: `native/flow-status.json`
was measured at `repo_head 9562b8f`, before `f05f57b`, so it still records this script FAIL on
the superseded `0010` needle, and no sweep has been run against the corrected pin. Do not read
the corrected pin as a claim about how far the script now gets.

`gbcoab-flow-test.ps1` (**was RED as of 2026-09-05 and red before that round; that red run ENDED on 2026-09-10 -- two controlled 30-script sweeps that day, 28 PASS / 2 FAIL with ZERO status changes and byte-identical needles between them, both record PASS**) pins the first dedicated non-Krynn combat/resume flow
when the local `coab_extracted\Data` dump is present. It runs Curse/CoAB
`GBBOOT /E /X /A 5 /B 50`, verifies the ECL5/GEO5 wall bridge and first-person
snapshot, confirms the combat-yield `GBEF` imports real `MON5CHA.DAX` groups,
checks the tactical `_GBCOMB.RAW`, exact deterministic combat trace, `enemy`
outcome, and post-combat `GBRS` resume dump. It also runs the neighboring
`GBBOOT /E /X /A 5 /B 51` Dracandros combat block, pins its one-group
`MON5CHA.DAX` import, tactical RAW, deterministic enemy outcome, `GBCR`, and
post-combat resume text. A third direct leg runs
`GBBOOT /E /X /A 5 /B 53`, pins the real noncombat/menu `GBEF`, verifies the
first-person RAW and wall bridge, and rejects tactical/resume sidecars. The same
script now also seeds a
normal area-2 first-person pose at `(5,10)` facing east, creates
`COAB_CLERIC`, `COAB_FIGHTER`, and `COAB_MAGE` through `/R`, runs bounded
`GBBOOT /E /J /A 2 /T 1`, verifies the Curse/CoAB `TITLE.DAX` front door,
including CGB's bounded DAX frame playback, the refreshed GBPS count, and the
`GBST` step into descriptor `136` at `(6,10)`, and proves SearchLocation selects
the bar-brawl event text before
handing a real `MON2CHA.DAX` monster group plus the created GBPR party to
CCCOMBAT. That leg asserts the separate tactical
`_GBCOMB.RAW`, imported `p2` party member in the combat trace, `party` outcome,
three-row `GBCR` bridge, and the post-combat resume text that tosses the
survivors outside. It then relaunches from the persisted `GBSN` pose and
byte-identical GBPR roster, and verifies a normal follow-up exploration step
from `(6,10)` to descriptor `128` at `(7,10)` without entering tactical combat,
so the proof covers created-party persistence and return-to-exploration state
after the battle.
Current sweep (2026-10-04): `gbcoab-flow-test.ps1` is PASS; the route-specific seven-event GBSL result and natural continuation are verified.

`gbdqk-flow-test.ps1` (**was RED as of 2026-09-05 and red before that round; that red run ENDED on 2026-09-10 -- two controlled 30-script sweeps that day, 28 PASS / 2 FAIL with ZERO status changes and byte-identical needles between them, both record PASS**) pins a focused DQK HLIB flow against the local original
disk layout. It runs `GBBOOT /E /X /A 18`, verifies automatic six-member GBPS
loading from `SAVGAMA.QSV`, the derived DQK `PARTYSTRENGTH` seed that GBBoot
passes on to CCECL, the 16x11 DQK wall bridge, generated GBWS wall bundle,
nonblank 320x200 GBWS-rendered frame, and the corrected Gen2 area-18 script
effects (`LOAD_FILES 18,1` plus DQK low-word `CALL` routine 1).
Current sweep: `gbdqk-flow-test.ps1` is PASS (2026-10-02).

`gbdqk-dispatch-flow-test.ps1` promotes representative DQK dispatch-only starts
out of the broad engine-smoke bucket. It runs original-layout `/A 22`, `/A 30`,
`/A 38`, and `/A 50` through `GBBOOT /E /X`, then verifies their real HLIB
ECL/GEO map handoffs, WGRD/GBWS output, nonblank 320x200 preview frames, and
preserved `GBSX` host events including `PICTURE`, `PARTY_SURPRISE`, `PRINT`,
DQK `CALL`, and `PARLAY` records without yielding tactical combat sidecars.
Current sweep: `gbdqk-dispatch-flow-test.ps1` is PASS (2026-10-02).

The final CCFP launch receives `/N <tools-dir>\_GBSESS.GBS`. `GBSN` version 1
stores the live map position, even-direction facing, and map dimensions. CCFP
loads it only after validating the active WGRD dimensions and bounds, writes it
on walker exit and scripted movement, and also establishes it during `/S`
snapshots. Consequently a later GBBoot launch, including `/E /X`, resumes the
same first-person pose; combat helpers do not reset or rewrite that state.

During normal `/E` walking, CCFP also receives `/Y <tools-dir>\_GBSTEP.BIN`.
Every successful forward/back step writes a `GBST` destination descriptor, x/y,
and even-facing pose, then returns code 10 to GBBoot. For DQK/Gen2, GBBoot first
invokes CCECL `/Q <cellWord> /F <facing>` at vmRun1, where `cellWord` is the
packed `GBST` destination x/y word, so per-step runtime memory is updated with
the same raw facing ordinal as the retail loop. It then invokes CCECL `/J
<descriptor> /F <facing>` at the block's verified SearchLocation pointer,
importing the prior GBEF sparse memory/RNG/clock through
`/P <prior.gbef>`. Dialogue effects return to CCFP; combat effects run through
CCCOMBAT and `/R` resume before CCFP is relaunched at the GBSN pose.
`GBBOOT /E /T [n]` drives bounded forward steps without graphics or keyboard
input for the same host loop. The default budget is 16 successful movement
yields, and an explicit `n` clamps headless automation for open corridors while
still processing the final yielded ECL event before stopping. `gbflow-test.ps1` pins real area-1 descriptor 140
(skeleton-room dialogue + persistent flag) and descriptor 129 (six-member
combat + outcome resume).

For profiles with known ECL/GEO
init data, `GBBOOT` runs sibling tools from the same directory. CoK/DoK default
to `ECL1.DAX` block 34; `/A 2` and `/A 3` use the verified Krynn area entry
blocks `ECL2.DAX` block 48 and `ECL3.DAX` block 80. Executable-less
`KRYNN.CFG`/`DKK.CFG` + `ECL1.DAX` + `GEO1.DAX` folders, including direct
`GAME\` wrappers, keep the CoK/DoK profile names and use that same native
area-1 ECL path while refusing plain chainload. Curse/CoAB data uses the
verified chapter archives: `/A 2` starts `ECL2.DAX` block 1, `/A 3` starts
`ECL3.DAX` block 16, and `/A 4..6` use the verified sparse preview starts
32/49/64. DQK runs `DISK3\ECL.GLB` entry 1 in the original disk layout; `/A 2`
through `/A 5`, `/A 7`, `/A 10`, `/A 14`, `/A 18`, `/A 22`, `/A 26`, `/A 30`,
`/A 34`, `/A 38`, `/A 42`, `/A 46`, `/A 50`, `/A 54`, `/A 62`, and `/A 66`
are verified original-layout DQK starts that emit
usable `LOAD_FILES` effects. Entries 4, 5, 22, 26, 30, 46, and 50
fall into packed data after the map handoff; the native `/E` bridge treats those
post-`LOAD_FILES` bad-opcode stops as clean preview exits, preserving the emitted
map/art bridge and booting the native walker. When a DQK script-selected wall
set is outside the local `8X8DB/C` libraries, GBBOOT clamps the native GBWS
producer to primary wall set 0 instead of passing an invalid index to CCHLIB.
`/A 14` loads GEO 14 and captures the entry's
16 PICTURE script effects in the native dump. Repeated stable bridge handoff
loops now stop as clean native-preview exits instead of running to the VM safety
budget. `/A 46` starts from ECL entry 46 but hands off to GEO 47 after script
flow. Original disk-layout data-only DQK runs `DISK3\ECL.GLB` entry 1 by
default; flat generated/data-only DQK layouts run `ECL.GLB` entry 1 by default.
`/B <block>` is an
experimental native ECL entry override: for DQK/HLIB ECL-backed profiles it
selects the `ECL.GLB` area/member id directly, which is useful for generated
HLIB builds and DQK entries outside GBBOOT's curated `/A` smoke list. For Gen1
DAX profiles it selects `ECLn.DAX` plus `GEOn.DAX`, using `/A n` when supplied
and area 1 otherwise, then runs the normal CCECL effect chain from that block. For FRUA-style
profiles with both `SCRIPT.GLB` and `GEO.GLB`, `/B` explicitly promotes
`SCRIPT.GLB` to the same HLIB ECL container path that `CCECL` uses for DQK-class
`ECL.GLB`; this is an escape hatch for verified/generated script containers,
not a default claim about stock FRUA startup semantics. This is useful for
externally verified broader-game starts without hardcoding them into the
detector. In each ECL-backed case `GBBOOT` first runs:

1. `CCECL.COM <ecl> <entry> [seed args | /G <tools-dir>\_GBSEED.BIN] [/B <tools-dir>\_GBPARTY.GBP] /E <tools-dir>\_GBECL.BIN`

If sibling `CCEFX.COM` is present, `GBBOOT /E` also writes
`<tools-dir>\_GBECL.TXT`, a readable dump of the `GBEF` header, `LOAD_FILES`/
`LOAD_PIECES` bridge prefix, encounter/NPC handoff, `GBRS` continuation summary,
captured `GBSX` script effects, and the optional `GBES`/`GBHD`/`GBCL` tails.
This is optional and does not gate the boot chain.

If that effect record reports a `COMBAT` yield with queued `LOAD_MONSTER`
groups, `GBBOOT` leaves the first-person exploration path and hands the effect
record to the separate tactical engine:

2. `CCCOMBAT.COM /E <tools-dir>\_GBECL.BIN [MONnCHA.DAX|DISK2\MONCHA.GLB|MONCHA.GLB] 4660 <tools-dir>\_GBCOMB.TRC <tools-dir>\_GBCOMB.OUT [<tools-dir>\_GBCOMB.RAW] /R <tools-dir>\_GBCR.BIN`
3. `CCECL.COM <ecl> <entry> [seed args | /G <tools-dir>\_GBSEED.BIN] [/B <tools-dir>\_GBPARTY.GBP] /R <tools-dir>\_GBECL.BIN <tools-dir>\_GBCOMB.OUT /E <tools-dir>\_GBRES.BIN`

When the optional dump helper is present, the resumed effect record is also
written as `<tools-dir>\_GBRES.TXT`.

This includes menu resumes. GBBOOT selects the `GBHS` effect mode from the
actual output path, independently of whether combat changed the party. The
2026-10-11 review reproduced a missing menu-resume dump on HEAD: both menus
completed, but mode 1 reread the initial record. Selecting mode 2 for
`resumepath` restores the resumed dump without changing combat-mutation state.
The CoK, DoK, and named-DoK-party cases in `gbboot-test.ps1 -EngineSmoke` check
both records and cold continuation.

CoK adds `CCCOMBAT /J` and uses a placeholder seed `0`: combat reads the full
32-bit RNG state from the paused GBEF v9 GBRS prefix and advances the original
CoK recurrence. GBCR v2 retains the 16-byte header and six-byte party rows,
placing the final RNG at bytes 12..15. GBBOOT validates the complete result
length, version, count, outcome, ordinals and conditions before roster writes,
then publishes RNG into the paused effect before CCECL resumes. A GEO fallback
retains the resumed VM for camp checkpoints. Legacy calls keep GBCR v1 and their
previous RNG. This establishes state continuity; original combat AI, initiative
and complete damage parity remain unfinished. Roster and RNG publication is
not a combined crash-atomic transaction.

`cokcombat-rng-test.ps1` checks five full-width seeds, nine child rejection
cases, nine malformed/missing host-result cases, a legacy control, and a real
GBBOOT combat/script/cold-checkpoint round trip. The child validates the used
130-byte GBEF prefix; it does not validate the entire VM envelope.

For Gen1 DAX games, `GBBOOT` keeps the exploration wall bridge at
`<tools-dir>\_GBWALL.BIN`, and also copies or rebuilds the active combat wall as
`<tools-dir>\_GBECL.WGR` beside the effect file before the tactical handoff.
`CCCOMBAT` imports that same-stem `.WGR` as blocked tactical terrain without a
long `/W` argument, which keeps MON archive, RAW snapshot, `GBCR`, and GBPR
party imports below DOS's 127-byte command-tail ceiling. DQK/HLIB movement-yield
combat uses the same no-`/W` contract, asking `CCGEO /C` to bake a compact
`<tools-dir>\_GBECL.WGR` 10x10 sidecar centered on the yielded dungeon position.

If an ECL script yields `COMBAT` without queued encounter groups, `GBBOOT`
does not launch `CCCOMBAT`. It writes a `victory` outcome sidecar and resumes
the ECL continuation directly with `CCECL /R`; this covers real empty/no-enemy
script branches such as the DoK block-32 healer path while keeping invalid
tactical handoffs out of `CCCOMBAT`.

This boundary is intentional. Exploration, ECL side effects, map baking, and
first-person rendering stay in the `CCECL`/`CCGEO`/`CCFP` chain; initiative,
tactical positions, movement, attacks, flee/guard actions, and the combat
outcome are owned by `CCCOMBAT`. The text outcome sidecar remains the value
consumed by `CCECL /R`, while `_GBCR.BIN` is the first binary combat-result
contract: `GBCR` v1 stores outcome, XP award, party record count, and
per-party ordinal/condition/final-HP/max-HP rows. After `CCCOMBAT` returns,
`GBBOOT` applies current HP back into `_GBPARTY.GBP` for CoK, DoK, and DQK
rosters before resuming `CCECL`. CoK victories also add `floor(xpAwarded / rosterCount)`
to the imported CoK member's verified **u32** XP accumulator at body bytes
`0x116..0x119`, carrying into the high word. For original low-numbered CoK save
slots, those same verified HP and XP writes are also applied to
`SAVE\CHRDATA#.SAV`, so a later native boot reloads the combat result instead
of rebuilding a fresh GBPR from stale source saves. Byte `304..305` is retained:
it is the static monster flat-award term used while totaling defeated enemies,
not player XP. CoK current HP uses body byte 407; maximum HP stays at byte 98
across combat, ECL damage and save writeback. New native CoK characters initialize
both stores. `gbcok-playable-flow-test.ps1` retains the injured mage's maximum
through persistence and a second synthetic encounter import without restoring HP.
`CCCOMBAT` treats imported zero-HP GBPR members as
unconscious/inactive for tactical side counts. DoK and DQK compact rosters also
translate the `GBCR` condition enum (0 alive, 1 unconscious, 2 dead, 3 fled)
to the `GBD1` condition flags (0, 2, 1, 8 respectively) at tail offset 24/body
offset 240, persist max HP at tail offset 26/body offset 242, and set `GBD1`
flags bit 1; `CCCOMBAT` imports those fields on later `/P` loads. DQK still
leaves the source QSV unchanged and uses `_GBPARTY.GBP` as the native combat
state layer. CoK imports status byte 392: down 4 and dying 5 disable the member,
while dead 6 retains the dead result. GBBOOT writes newly unconscious normal
members as status 4 and dead results as status 6, both in GBPR and original
low-numbered saved-character slots. Existing dying and other conditions are
preserved rather than cleared by the narrower combat-result enum. Native combat
does not yet simulate CoK's separate dying counter. `gbboot-create-test.ps1`
rebuilds the roster from copied retail saves twice and checks all 409 body bytes,
including dead/dying preservation and new unconscious condition writeback.
`gbdok-playable-flow-test.ps1` checks two consecutive GBBOOT combat/reload
cycles with dead, unconscious and fled members. Copying the GBCR enum directly
into GBD1 used to swap dead/unconscious states and misread fled as both flags;
the explicit conversion fixes that shared compact-roster writeback path.
Latest full sweep (2026-10-09): `gbdok-playable-flow-test.ps1` PASSes on
unchanged native source after the prior 2026-10-08 timeout. Both the isolated
run and the complete 44/44 sweep pass. `gbcok-playable-flow-test.ps1` and
`gbboot-create-test.ps1` are PASS.

For a nonempty CoK, DoK, Curse/CoAB, or DQK roster, step 2 also receives
`/P <tools-dir>\_GBPARTY.GBP`. CCCOMBAT validates GBPR v1 and imports all six
available party records into the live tactical array. CoK current HP, THAC0,
AC, and saved damage dice come from the verified CoK offsets. When the current
DOS directory still exposes the original CoK save directory, CCCOMBAT
opportunistically opens `SAVE\CHRDATA#.STF` and overlays verified readied
equipment semantics: Plate Mail/Ring Mail/Shield AC, armor-limited movement,
Long Sword/Hoopak/Mace melee dice, Short Bow range, Arrow ammunition, weapon
magic pluses, and AD&D Strength/Dexterity combat modifiers. If the STF sidecar
is absent, the saved CoK fields remain the fallback. DoK THAC0 and
baseline damage come from the compact `.GAM` offsets, while HP and final AC come from CCPARTY's
`GBD1` derived tail when present. That tail derives HP from inferred
class/level/Con, uses `.WIZ` spell voting for DoK caster class where available,
folds verified `.JNK` armour/shield records into AC, and folds verified readied
Long Sword/Hoopak weapon types plus supported weapon magic and the AD&D Strength
damage table into damage dice. It also stores final THAC0 after supported
readied-weapon magic pluses and the AD&D Strength to-hit table, plus
armor-derived party movement for unarmored, Ring Mail, and Plate Mail cases.
CCCOMBAT now also consumes `GBD1` level/class for imported warrior-style records:
level 7..12 uses the existing `halfAttacks=3` 2,1,2,1 cadence, and level 13+
uses two integer attacks per round. This is pinned with a synthetic DoK-style
GBPR import, and the DQK QSV/QCH importer now avoids the unusable all-zero
record byte 89 by deriving coarse classes from item-use/current-level fields
(`SIR DRYDEN=1`, `JORIS=2`, `LENDUIRA=1`, `NEACAIL=4`, `ALARIC=1`,
`MAIGUREIGNE=2` for the shipped `SAVGAMA.QSV`). If an older
compact GBPR lacks the tail,
CCCOMBAT falls back to the old deterministic placeholder import. Magic damage
for unsupported item types, DQK inventory/equipment effects, movement for monsters/unsupported armor cases, and
richer equipment effects retain explicit Tier-1 defaults until their derivation is wired. Without `/P`, the existing
deterministic fixture party remains available for isolated tests and unsupported
save generations.

For Gen1 DAX installs the `MONnCHA.DAX` choice comes from the resolved
`GEOn.DAX`/`ECLn.DAX` profile path, with `MON1CHA.DAX` as a fallback when the
area-specific archive is absent. `CCCOMBAT` writes `party`, `enemy`, or `draw`
to the outcome sidecar. `CCECL /R` restores a v9 combat `GBEF` continuation state
(and still accepts earlier v3+ records),
maps `party` to the victory compare branch and `enemy`/`draw` to the
conservative defeat branch, then continues after the `COMBAT` opcode. `GBBOOT`
prefers any resumed `LOAD_FILES` GEO id from `_GBRES.BIN`; if the script loaded
the map before a terminal combat, it falls back to the original `_GBECL.BIN`
map effect. Combat-only effects still stop after combat, because there is no
known map to render.

GBBOOT keeps numeric `/C <n>` as the CCECL menu-choice seed. When `/C` is
followed by a nonnumeric token, GBBOOT treats that token as a CCCOMBAT tactical
command script and appends it to the combat child command. The current script
letters are `G`/`W` for guard/wait, `F` for a flee step, `P` for the
party-wide flee command, `M` followed by keypad directions for movement, `D`
for move-mode Done (or menu Delay), `E` for End, `Q` for the existing auto
action, and `C` for the first title-owned Cast path: DoK raw spell id 15
(Magic Missile). `C` reads the acting retail slot's fixed 220-byte
`SAVE\CHRDATA#.WIZ`, requires a prepared id-15 instance in its confirmed
right-justified 34..73 window, targets the weakest living foe, rolls the
shared-ruleset 1d4+1 baseline (the original DoK dice dispatch remains
unlocated), and records `{party ordinal, 15}` in GBCR v1 bytes
12..13. The v1 bridge carries one receipt, so a second Cast is explicitly
rejected before it changes combat until a versioned multi-receipt contract
exists. CCHOST preflights that receipt against the compact GBD1 record and
the exact source WIZ sidecar before roster mutation, then consumes one id-15
instance only after the complete handoff. Movement and attacks draw from one turn-scoped ledger, so a later `M`
can spend only movement left by an earlier Move command. When a headless Move
consumes its final input byte, the turn ends instead of silently inventing an
auto action. `A`, `U`, `T`, `B`, `V`, and `S` have no owned primitive yet:
they display a rejection in live play and act exactly as End headlessly.
`gbboot-test.ps1` pins this end-to-end with `GBBOOT /E /X /C G` and
`GBBOOT /E /X /C P`: CCECL yields combat, GBBOOT launches CCCOMBAT with the
script, the tactical trace contains the commanded action, and the resulting
combat outcome sidecar still drives resume.

Otherwise `GBBOOT` consumes the script's emitted `LOAD_FILES` GEO id before
baking the map:

4. `CCGEO.COM /B <geo> <map> <tools-dir>\_GBWALL.BIN`
5. Gen1 DAX texture path: `CCFP.COM <tools-dir>\_GBWALL.BIN /E <active-effect> /T /A <area> /W`
   when matching `WALLDEF<area>.DAX` + `8X8D<area>.DAX` art is present.
6. DQK: `CCHLIB.COM W <8X8DB/8X8DC.TLB source> <local-wallset> <tools-dir>\_GBWSET.GBW 3`, then
   `CCFP.COM <tools-dir>\_GBWALL.BIN /F <tools-dir>\_GBWSET.GBW /E <active-effect> /W`.
   If the selected HLIB wall set is unavailable, GBBOOT keeps the baked map and
   launches the outline walker instead.

That boots directly into the native ASM first-person walker. Temporary seed,
effect, resume-effect, wall, wall-set, combat trace, combat snapshot, and combat outcome files are
written beside `GBBOOT.COM`, not into the mounted game directory. With `/X` or
bounded `/T`, GBBOOT also asks combat yields to render one tactical frame to
`<tools-dir>\_GBCOMB.RAW` before the deterministic combat resolver runs. For
`/X` map renders, it replaces the final CCFP `/W` with
`/S <tools-dir>\_GBVIEW.RAW`, so the same native preview renders one frame,
writes the raw 320x200 first-person snapshot beside `GBBOOT.COM`, and exits
without an interactive DOSBox window. CoK, DoK,
and Curse/CoAB installs with matching `WALLDEF<area>.DAX`
and `8X8D<area>.DAX` now take the textured `/T /A <area>` path using the resolved
`LOAD_PIECES` ids from `CCECL`. When the active effect record carries a v6+
`GBSX` inline text slot, `CCFP` overlays the first decoded string in the bottom
message band of the Gen1 textured and DQK/GBWS first-person views. When the
record also carries the v7 `GBES` setup tail, `CCFP` draws a deterministic
center-view approach marker scaled by the current `APPROACH` distance (or, when a
matching `CCFP /I` GBIM icon is supplied, that CPIC icon instead; see the first-person
encounter art paragraph in the GBIM section). When no
inline script text is present, a v9 `GBCL` clock tail is rendered in that same
message band as a compact `TIME HH:MM DNN` state line. The same `GBCL` tail now
also enables the native first-person sky backdrop: CCFP paints the open-sky
band above the horizon and stamps the deterministic 8x8 sun/moon body for the
pinned hour/facing cases before the wall geometry is drawn. When the WGRD bridge
contains CCGEO's optional plane2 backdrop/roof tail, the current cell's high bit
keeps the roofed ceiling black and suppresses the body, matching the outdoor-only
sky gate. The same bridge can carry the optional plane3 door/gateway tail, which
CCFP uses for movement collision so walled edges flagged as doors or gateways are
passable in `/M` and `/W`. The Gen1 textured path still loads
global boot tile blocks `0xCA/0xCB` from `8X8D1.DAX`, matching the engine's
shared wall-cap sets, while area-specific wall pieces come from
`8X8D<area>.DAX`. If an interactive `/T` preview cannot build the selected
texture tables, `CCFP` falls back to the outline wall renderer instead of
dropping out of the boot chain; `/R` table-dump mode remains strict and still
fails on texture decode errors. DQK uses the first resolved `LOAD_PIECES` id as
the 1-based starting HLIB wall-set: ids 1..9 select `8X8DB.TLB` sets 0..8, and
ids 10..17 select `8X8DC.TLB` sets 0..7. GBBOOT emits a 3x47-image `GBWS`
bundle from the chosen local set, so slots 1..5, 6..10, and 11..15 can select
their corresponding wall-set band in `CCFP /F`. If `CCHLIB W` rejects that
wall-set range, GBBOOT falls back to the outline wall renderer rather than
failing the whole native boot.

For Pool, Secret, Gateway, Treasures, Pools of Darkness, Buck Rogers Countdown,
and Matrix Cubed profiles with both `ECL1.DAX` and `GEO1.DAX`, `/E` now uses
the verified area-1 entry path directly:
`CCECL.COM ECL1.DAX entry 34 -> CCGEO.COM /B GEO1.DAX`. For broader DAX
profiles or partial installs whose startup ECL entry is not yet verified, `/E`
can still use the first detected `GEO1.DAX`..`GEO8.DAX` archive directly:
`CCGEO.COM /B <geo> 0 <tools-dir>\_GBWALL.BIN`, where Gen1 map id `0` means
"first valid GEO block in the archive", then `CCFP.COM ... /W`. FRUA-style HLIB
fallback installs and executable-less HLIB/GLB dumps get the same raw-map
treatment when `GEO.GLB` is present; there, `CCGEO` map `0` is simply the first
sniffed GEO member, while nonzero Gen2 ids are resolved through the HLIB id
table. When matching `8X8DB.TLB` art is present but no ECL effect record exists,
`GBBOOT /E` runs `CCHLIB W` from wall-set 0 by default and launches `CCFP /F`
without an `/E` sidecar. With an explicit raw HLIB `/A n` override, `n` remains
the `GEO.GLB` map id and also acts as a best-effort 1-based wall-set hint:
1..9 select `8X8DB.TLB` sets 0..8, while 10..17 select `8X8DC.TLB` sets 0..7
when that optional second library is present.
That keeps the native preview honest: raw map walking is exercised without
guessing an ECL start block, raw DAX block id, or HLIB member position. Matrix
Cubed's real map archive names are still unverified in this repo; the Matrix
raw-map and `MATRIX.CFG` data-only smoke cases only prove the fallback when a
matching `GEO*.DAX` is present. Generic Gen1 data-only dumps take this same raw-map path with any
detected `GEO1.DAX`..`GEO8.DAX`, `exec: (native /E only)`, and a plain
chainload refusal. FRUA-style HLIB installs take the same conservative
`GEO.GLB` raw-map path, upgraded to `GBWS` wall art when matching
`8X8DB.TLB`/optional `8X8DC.TLB` libraries are present, without claiming a
verified FRUA script entry. If the matching `WALLDEF<area>.DAX` and `8X8D<area>.DAX`
files are present, and the boot-cap `8X8D1.DAX` file is also available,
`GBBOOT /E` upgrades that raw DAX walker to `CCFP /T /A <area>` without passing
an `/E` sidecar; this uses CCFP's default piece ids rather than claiming a
verified startup ECL path.

Neverwinter Nights (DOS/AOL) is the ECL0/GEO0 exception in this Gen1 family:
the local user-provided archive starts native `/E` as
`CCECL.COM ECL0.DAX entry 1 -> CCGEO.COM /B GEO0.DAX`. Its `/A 1`, `/A 2`,
and `/A 3` overrides are mapped to observed archive starts 10, 20, and 30
respectively. `/A 7` is now a verified script-only combat probe: the inspected
archive has `ECL7.DAX` but no `GEO7.DAX`, so GBBOOT keeps `GEO0.DAX` as the
view fallback, runs `ECL7.DAX` entry 79, and seeds the two AOL-host variables
needed to reach the observed beholder encounter through `MONCHA.DAX`. Explicit
`/0` sparse-memory seeds are preserved before those defaults, so focused probes
can also drive other real ECL7 selector branches through GBBOOT itself.
Its `TITLE.DAX` also follows the bounded Gen1 `/J` title helper path before
continuing into the same ECL0/GEO0 preview. NWN now participates in the
Gen1 native-party path as well: `/R` creates GBPR members, refreshes GBPS for
ECL/combat, and the smoke coverage verifies `MONCHA.DAX` handoff,
native-created party import, `GBCR` result output, title-to-combat routing, and
the `/A 7` seeded ECL7 selector paths. After the selector-125 combat/resume
route, the same smoke launches NWN once more without `/R`, reloads the
post-combat GBPR, renders the default ECL0/GEO0 preview, verifies no tactical
sidecars are written, and confirms the roster bytes stay unchanged. It then
takes a real bounded ECL0/GEO0 movement step through the normal CCFP walk loop:
`GBBOOT /E /T 1` writes `GBST` descriptor 33 at `(8,14)` facing south, persists
that first-person pose in `GBSN`, runs the matching SearchLocation text event
(`THE SIGN OVERHEAD READS 'THE RED...`), writes no tactical sidecars, and keeps
the post-combat GBPR byte-identical. A second natural NWN leg now starts
`GBBOOT /E /A 1 /T 1` from area-1 pose `(14,4)` facing east; because this NWN
entry does not emit `LOAD_FILES`, GBBOOT falls back to the selected `/A` GEO
archive/map (`GEO1.DAX` block 10), walks into descriptor 229 at `(15,4)`, queues
monster groups `69 x2` and `30 x3` from real `MONCHA.DAX`, runs `CCCOMBAT`,
writes a three-row `GBCR`, and resumes the ECL continuation at area 10 PC
`03E0`. It then launches once more with `GBBOOT /E /A 1 /T 1`, reloads the
post-combat GBPR and persisted area-1 `GBSN` pose `(15,4)` facing east, treats
that boundary as a bounded continuation with no new step, rebuilds the area-1
wall bridge, writes no tactical sidecars, and confirms `GBSN` and `GBPR` stay
unchanged. Selector 125, 108, and 121 are verified as real combat yields. Selector 127, 124, and
122 are pinned as monster-setup branches that preserve their `LOAD_MONSTER`
records but end in the AOL-host `NEWECL #29` chain path without launching
`CCCOMBAT`.
`native\gbnwn-flow-test.ps1` is the optional real-data smoke for this profile:
it uses `GOLDBOX_NWN_PATH` or the local `D:\Games\Neverwinter Nights DOS\...`
extraction, skips cleanly when absent, and verifies title playback, `/R` party
creation, ECL0/GEO0 preview, persisted party reload, `GBPS` sparse AOL-host
seeds, the selector-125 beholder branch plus selector-108 and selector-121
alternate real `MONCHA.DAX` encounter groups, the selector-127/124/122
  noncombat chain exits, `_GBCOMB.RAW`, `GBCR`, post-combat default continuation
  from the same GBPR, the natural ECL0 movement/text step, the natural area-1
  descriptor-229 movement-to-combat/resume path, and the post-natural-combat
  bounded continuation.
The 2026-10-03 full flow sweep passes `gbnwn-flow-test.ps1` after `validate_gbpr_header` admitted CCPARTY's canonical noncompact v2 roster for generic Gen1 DAX profiles. The full NWN title/create, seeded ECL7 combat, persisted party reload, natural movement, and combat/resume routes now pass.

`native\gbpool-flow-test.ps1` is the optional native-preview smoke for the local
Pool of Radiance Amiga/WHDLoad data dump. It uses `GOLDBOX_POOL_PATH` or the
local `D:\Games\Emulator\Amiga\WHDLoad\...\PoolOfRadiance\data` path and skips
cleanly when absent. The WHDLoad Pool archives are not DOS 9-byte little-endian
DAX files; they use a big-endian 10-byte TOC (`u16 id`, `u32 offset`,
`u16 compSize`, `u16 rawSize`) with ByteKiller-compressed payloads. The smoke
normalizes only a scratch copy under `native\build`, ByteKiller-decompresses
each block, repacks the raw bytes as DOS signed-byte literal RLE, aliases
`geo.dax`/`ecl.dax`/`walldef.dax`/`8x8d.dax`/`moncha.dax` to the current Gen1
names, and first runs `GBBOOT /E /X /A 1` through the Pool data-only marker. It
then reuses the created GBPR for default `GBBOOT /E /X`; GBBOOT probes the
Pool ECL TOC and selects the first verified real Pool `ECL1.DAX` map bridge
when block 2 is present (`GBEF flags=0003 geo=0002`,
`GBLP raw=0001 0003 0014`) through CCGEO/CCFP into a nonblank
`_GBVIEW.RAW`. A third phase seeds the persistent first-person session at a
verified open Pool entry-2 edge and runs `GBBOOT /E /T 1`, requiring `GBST` and
`GBSN` to advance from `(4,0)` south to `(4,1)`, then verifies the source-owned
eight-frog combat handoff and resume at that destination. A fourth, isolated
phase reuses the same native Pool roster and runs `GBBOOT /E /X /B 15 /@ 33208`
to prove the source-terminal continuation without fabricating a combat handoff. `CCECL` treats Pool opcode `A1` as a zero-operand host/no-op marker so block 15 can continue past that dialect byte. The smoke proves Pool profile detection, native `/R` party creation, GBPS refresh, WGRD wall bridge creation, raw-GEO preview, an ECL-driven map preview, one bounded persistent movement-to-combat/resume path, and the isolated `SPRITE_OFF`/`CALL` terminal branch with no combat artifacts. **PASSED IN THE HISTORICAL 2026-09-13 MEASUREMENT.** It
deliberately does not claim Pool title/music, textured wall parity, broader
natural exploration routing, or a natural dungeon-step-to-combat route yet; real
Pool ECL block ids differ from the shared broader-profile synthetic entry-34
canary.
Current sweep (2026-10-03): `gbpool-flow-test.ps1` PASS; raw GEO preview, ECL map bridge,
movement/combat/resume, and terminal ECL branch all completed.

`native\gbsecret-hlib-flow-test.ps1` is the optional raw-map native-preview
smoke for the local Secret of the Silver Blades Amiga/WHDLoad `GEO.GLB` data
dump. It uses
`GOLDBOX_SECRET_PATH` or the local `D:\Games\Emulator\Amiga\WHDLoad\...`
Secret paths and skips cleanly when absent. The Amiga file is a big-endian
`GLIB DATA` container with 1024-byte raw 16x16 GEO members; `CCGEO` now accepts
that container directly by swapping the pointer/id-table metadata and loading
the raw four-plane maps into the same bridge/render buffer used by HLIB and
Gen1. The smoke copies the original `GEO.GLB` to scratch unchanged, then runs
`GBBOOT /E /X` through the generic HLIB/GLB raw-map path and verifies a nonblank
`_GBVIEW.RAW` without claiming Secret startup ECL semantics, title/music,
textured wall parity, or natural combat routing yet. Its provenance control
then zeroes map 0's actual staged GLIB member (member 1, the 1024-byte range
`[162,1186)`), reruns the same route, and requires `_GBWALL.BIN` to differ
before restoring both the input and bridge. The baseline and mutated bridges
differed in 563 bytes; an inverted comparison was observed RED, so this probe
now proves the raw GEO payload is consumed rather than merely accepted.

`native\gbsecret-glib-flow-test.ps1` is the paired optional ECL/GEO smoke for
the same Secret Amiga/WHDLoad dump. It stages original `DISK2\ECL.GLB` and
`DISK2\GEO.GLB` unchanged as flat `ECL.GLB`/`GEO.GLB`, runs
`GBBOOT /E /X /A 16`, and verifies native `CCECL -> CCGEO -> CCFP` output:
`GBEF v0009`, `geo=0010`, matching `GBLF operands=0010`, a nonblank
`_GBVIEW.RAW`, and no tactical sidecars. This proves Secret's GLIB metadata
and Gen2-style ECL payload can drive the native first-person preview, but still
does not claim title/music, textured wall parity, or natural combat routing yet.
Its provenance control resolves area 16 through the staged ECL id table to
member 2 (`[950,7964)`), zeros only that payload, and requires the emitted
`_GBECL.BIN` bridge to change or disappear before restoring every baseline
artifact. An inverted comparison was observed RED, proving the real ECL
payload rather than just the GLIB header drives this route.

`native\gbsecret-glib-combat-flow-test.ps1` extends that Secret GLIB coverage
through a real ECL-to-tactical handoff. It stages original `DISK2\ECL.GLB`,
`DISK2\GEO.GLB`, and `DISK2\MONCHA.GLB` unchanged as flat native inputs, then
runs `GBBOOT /E /X /A 16 /@ 33930`. The `/@` value is the Gen2 virtual address
`0x848a` (`0x8000 + 0x048a`), a direct-entry island in Secret area 16 that
executes `LOAD_MONSTER(72,5,72)` followed by `COMBAT`. The smoke verifies
`GBEF status=0003`, `GBEC groups=0001`, monster id/count/pic `0048/0005/0048`,
then proves `GBBOOT` dispatches `CCCOMBAT` and writes `_GBCOMB.TRC`,
`_GBCOMB.OUT`, and a nonblank `_GBCOMB.RAW`. This is a real Secret GLIB
ECL/MONCHA bridge into native combat; Secret-specific monster stat offsets are
still not pinned, so the current tactical stats remain the deterministic GLIB
placeholder path documented in the `CCCOMBAT` section. Its provenance control
resolves monster 72 through the staged MONCHA id table to member 59
(`[5780,5868)`), zeros only that compressed record, and requires the combat
trace to change or disappear before restoring every baseline artifact. The
zeroed record has a zero declared decompressed length, which `CCCOMBAT` now
rejects instead of silently admitting a corrupt placeholder record; an inverted
comparison was observed RED.

`native\gbgateway-glib-flow-test.ps1` is the matching optional ECL/GEO smoke
for the local Gateway to the Savage Frontier Amiga/WHDLoad dump. It uses
`GOLDBOX_GATEWAY_PATH` or the local `D:\Games\Emulator\Amiga\WHDLoad\...`
Gateway paths, stages original `DiskC\ECL.glb` and `DiskC\Geo.glb` unchanged as
flat `ECL.GLB`/`GEO.GLB`, runs `GBBOOT /E /X /A 1`, and verifies
`GBEF v0009 flags=0001 status=0000 geo=0001`, matching `GBLF operands=0001`, a
nonblank `_GBVIEW.RAW`, and no tactical sidecars. This proves Gateway's GLIB
metadata and Gen2-style ECL payload can drive the native first-person preview,
but deliberately does not claim title/music, textured wall parity, or natural
combat routing yet. Its area-1 provenance control now finds the GLIB id-table
member for logical area 1, zeros that staged 1024-byte raw GEO member, reruns
the same route, and requires `_GBWALL.BIN` to differ before restoring the
staged file. This closes the former false-green where a broad payload corruption
could leave the header, effect record, and nonblank approach-marker frame green.

`native\gbdqk-amiga-glib-flow-test.ps1` is the optional real-data smoke for the
local Dark Queen of Krynn Amiga/WHDLoad `DISK3\ECL.GLB` + `DISK3\GEO.GLB`
pair. Both files are big-endian `GLIB DATA` containers, but their member
payloads remain normal DQK Gen2 ECL/GEO bytes. `CCECL` now accepts GLIB Gen2
containers by swapping only the header count, pointer table, and id-table
metadata, leaving ECL payloads untouched; `CCGEO` does the same for GEO maps.
The smoke stages the original Amiga files unchanged, runs `GBBOOT /E /X /A 18`,
and verifies the expected area-18 `GBEF`, `LOAD_FILES` bridge, captured `CALL`
script effect, and nonblank first-person `_GBVIEW.RAW`. It deliberately omits
wall TLBs and does not claim Amiga title/music parity or broader DQK Amiga
playability yet. Its provenance control resolves logical GEO id 18 through the
staged GLIB id table to member 5 (`[8030,8742)`), zeros only that Gen2 map
payload, reruns the same route, and requires `_GBWALL.BIN` to change or
disappear before restoring every baseline artifact. An inverted comparison was
observed RED, so this route proves the selected map payload is consumed.
Current sweep: `gbdqk-amiga-glib-flow-test.ps1` is PASS (2026-10-02).

`native\gbbuck-flow-test.ps1` is the optional real-data smoke for the local
Buck Rogers Countdown Amiga/WHDLoad data dump. It uses `GOLDBOX_BUCK_PATH` or
the local `D:\Games\Emulator\Amiga\WHDLoad\...\BuckRogersCountdownDday\data`
path, skips cleanly when absent, and verifies the data-only Buck detector,
native `/R` party creation, GBPS refresh, the default `ECL1.DAX` entry-34
front door, its noncombat `GBEF` effect dump, fallback to the selected
`GEO1.DAX` raw WGRD bridge when that entry does not issue `LOAD_FILES`, and a
nonblank `_GBVIEW.RAW` preview. It then reuses the created GBPR, seeds
`_GBSESS.GBS` at area-3 block 98 `(8,14)` facing east, runs
`GBBOOT /E /A 3 /B 98 /T 1`, verifies the resulting descriptor-142
`_GBSTEP.BIN`, and proves the control-room guard route through CCECL and
CCCOMBAT: `_GBECL.TXT` reports `GBEF flags=0028 status=0003` with
`MONSTER id=0017 count=0001 pic=0017` plus
`MONSTER id=0008 count=0007 pic=0008`, `_GBCOMB.RAW` is nonblank, `_GBCR.BIN`
is written, and the combat outcome is deterministic. The same flow now asserts
the post-combat `_GBRES.BIN`/`_GBRES.TXT` continuation (`DESTRUCT SEQUENCE...`
/ `DOOMSDAY WEAPON COUNTDOWN...`) and relaunches into a post-combat
`GBBOOT /E /X` preview that reloads the three-member GBPR without writing
tactical or step sidecars.
`native\ccecl-buck-entry-scan.ps1` is the matching opt-in combat-discovery
probe. It scans every real `ECL1.DAX`/`ECL2.DAX`/`ECL3.DAX` block through all
five Gen1 far-pointer header entries with representative `/O` encounter choices
and `/D` distance seeds, then writes `_BUCKENTRY.TXT` and `_BUCKENTRY.CSV`.
The current default local baseline covers 3,125 far-pointer/choice/distance
probes with `CombatRows=0` and `HaltRows=0`; the scan now fails if any Buck
entrypoint regresses to a VM halt. The CSV includes `ScriptCount` and
`ScriptOps` columns; the current baseline preserves host/script opcodes
`0E,12,29,2D,4C`, including Buck's observed extended `4C`, as GBSX events.
`native\ccecl-buck-chained-step-scan.ps1` is the lighter natural-walk
counterpart: it decodes real Buck GEO passable steps, runs the same
vmRun1-then-SearchLocation CCECL chain that GBBOOT walking uses, and writes
`_BUCKCHAIN.TXT`/`_BUCKCHAIN.CSV`. Use `-Blocks`, `-Choices`, and
`-Distances` to keep matrix scans bounded; the batch writer uses DOS-safe 8.3
names so large job counts do not lose outputs after job 9999. The CSV includes
`JobIndex`, `RouteIndex`, per-pass `Chain`, and symbolic halt reasons so
`CHAIN`/`FFFF` diagnostics are not mistaken for opcode discoveries. Its default
area-1 baseline now covers 996 real GEO-derived routes with `QueuedCombat=0`,
`FatalHaltRows=0`, and script ops
`0E,0F,11,12,22,23,29,2B,2D,31,33,39,3A,42,43,45,4B,4C`. A focused area-1
choice/distance matrix over choices `0..4` and distances `0,4,8,12,18` has
also been run in two bounded partitions (`-Blocks 32,35`: 626 routes / 15,650
jobs; `-Blocks 16`: 370 routes / 9,250 jobs), with `QueuedCombat=0`,
`HaltRows=0`, and no missing outputs in either partition. CCECL now frames
Buck extended opcodes `43`, `45`, and `46` as GBSX host/script events with
observed operand counts 1/2/2; `native\ccecl-effects-test.ps1` has a synthetic
fixture proving `43 argc=1`, `45 argc=2`, and `46 argc=2`. `42`, `4B`, and
`4C` remain observed zero-operand host/state transitions. Buck ECL3 block 98
also has a targeted `0x29` control-room framing case at offset `19D3`: the
normal 14-operand `ENCOUNTER_MENU` shape would swallow an aligned
`CLEARMONSTERS` / `LOAD_MONSTER` / `LOAD_MONSTER` / `COMBAT` island at
`1A92`, so CCECL resumes there and exports the real two-group guard roster
rather than treating the later naked `COMBAT` as an empty encounter. Buck ECL2
block 50 has one observed
15-operand `ENCOUNTER_MENU` at offset `048E`; the normal shared shape remains
14 operands. `native\ccecl-buck-b50-decode.ps1` expands real `ECL2.DAX` block
50 without DOSBox and now reports that special framing so the former `04B1`
`C9` byte is treated as operand data, not an opcode. The separate area-2 chained scan reported success including block 50: 3,282 real routes, `QueuedCombat=0`,
`FatalHaltRows=0`. The full `-Areas 1,2,3` discovery run reaches 7,135 routes
with `FatalHaltRows=0`; after the block-98 framing fix it reports 12 queued
combat candidates for the descriptor-142 control-room route, which are promoted
to `native\gbbuck-flow-test.ps1`. The remaining nonfatal unresolved rows are 13
area-3 `NEWECL` transitions to ids absent from `ECL3.DAX`. Run the full
discovery scan with `-AllowPromotedBuckGuard` when treating that promoted
block-98 guard route as baseline; without that switch, queued candidates still
fail so new combat discoveries cannot be silently absorbed.
Current sweep (2026-10-03): `gbbuck-flow-test.ps1` PASS; party creation, GEO preview,
guard combat/resume, and post-combat preview all completed.

`/A n` overrides the native preview area/map. For CoK/DoK, areas 1..3 stay on
the ECL-backed path using the verified area startup blocks above, so the native
preview still gets `LOAD_FILES`/`LOAD_PIECES`/combat effects before rendering.
For other Gen1 DAX profiles it first checks that `GEOn.DAX` exists, then forces
the conservative raw-map path through that archive's map `0` instead of guessing
an ECL startup block; a missing archive is reported as an unavailable native
area/map during dry-run planning. For HLIB/DQK ECL-backed profiles it changes
the `ECL.GLB`/`GEO.GLB` entry id. For raw HLIB/FRUA `GEO.GLB` previews with no
ECL sidecar, it changes the `GEO.GLB` map id and, when wall TLBs are available,
uses the same number as the explicit wall-set hint described above.

`/B block` still opts into or overrides the ECL-backed path for Gen1 DAX
installs: `GBBOOT /E /A 1 /B 34` requires `ECL1.DAX` and `GEO1.DAX`, runs
`CCECL ECL1.DAX entry 34`, and then uses the script-emitted `LOAD_FILES` effect
to render the map. If the matching `ECLn.DAX`/`GEOn.DAX` pair is absent, the
native plan reports the requested ECL entry/archive as unavailable instead of
falling back silently to a raw-map preview; an actual `/E` run with that
unavailable plan stops before launching the helper chain.
For FRUA-style HLIB installs, `GBBOOT /E /B n` requires `SCRIPT.GLB` plus
`GEO.GLB` and uses `CCECL SCRIPT.GLB entry n`; the smoke suite covers this with
a synthetic HLIB ECL fixture only. Missing `GEO.GLB`/`SCRIPT.GLB` for that
escape hatch reports the same requested ECL-entry/archive diagnostic.
The smoke suite covers both the default and explicit override paths with
synthetic Pool, Secret, Gateway, Treasures, Pools of Darkness, Buck Rogers
Countdown, Matrix Cubed, Neverwinter Nights ECL0/GEO0 plus `/A 1..3`, and
FRUA-style `SCRIPT.GLB` fixtures.

`/@ vaddr` is a GBBOOT-level pass-through to CCECL's direct-entry probe. It is
only for tests and research: it starts the selected ECL block at a verified
virtual address after normal GBBOOT seeding, then lets GBBOOT handle any emitted
combat, resume, and render artifacts. It does not alter the normal walk-loop
SearchLocation/vmRun1 dispatch.

`/1 cellWord` is the matching GBBOOT-level vmRun1 far-pointer probe. It starts
the selected ECL block through CCECL's `/Q <cellWord>` path after normal GBBOOT
seed/party setup, then lets the regular GBBOOT combat, resume, and follow-up
SearchLocation loop run. Like `/@`, it is a research/test hook; normal walking
still gets vmRun1 cell words from `_GBSTEP.BIN`.

Native-only data profiles print `exec: (native /E only)` and refuse a plain
chainload with a clear message. CoK/DoK data-only dumps run the verified
`CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX` path directly; named broader
Gen1 data-only dumps with both `ECL1.DAX` and `GEO1.DAX` run the same
area-1 ECL-backed path; DQK-class data-only dumps run the native
`CCECL ECL.GLB entry 1 -> CCGEO /B GEO.GLB` path directly; Curse/CoAB
data-only dumps run the verified ECL/GEO chapter path; generic Gen1 data-only
dumps use the raw `CCGEO /B GEO*.DAX map 0` preview, upgraded to `CCFP /T` when
matching Gen1 DAX wall art is present; generic HLIB/GLB data-only dumps use the
raw `CCGEO /B GEO.GLB map 0` preview, upgraded to `GBWS` wall art when matching
HLIB wall TLBs are present. The raw HLIB smoke coverage now includes `/A 10`
fixtures proving the explicit wall-set hint can select `8X8DC.TLB` without a
verified FRUA/DQK ECL effect record.

Smoke tests:

```
native\test.ps1
native\test.ps1 -Headless
native\test.ps1 -Visible
native\test.ps1 -EngineSmoke
native\test.ps1 -FlowSmoke
native\test.ps1 -FlowOnly
native\test.ps1 -RouteScanOnly -RouteScanSeedCount 4
native\test.ps1 -DokCombatAuditOnly -RouteScanSeedCount 4
native\test.ps1 -EngineSmoke -FlowSmoke
native\ccecl-effects-test.ps1
native\ccefx-test.ps1
native\ccdat-test.ps1
native\ccdatwiztest.ps1
native\cchlib-dqk-art-test.ps1
native\ccfp-effects-test.ps1
native\ccgeo-bridge-test.ps1
native\ccmusic-test.ps1
native\cccombat-test.ps1
native\cccombat-glib-moncha-test.ps1
native\ccparty-test.ps1
native\ccsession-test.ps1
native\gbboot-test.ps1
native\gbboot-test.ps1 -EngineSmoke
native\gbboot-test.ps1 -EngineSmoke -Visible
native\gbintro-flow-test.ps1
native\gbcok-playable-flow-test.ps1
native\gbplayable-suite-test.ps1
native\gbdok-intro-flow-test.ps1
native\gbdok-playable-flow-test.ps1
native\gbdqk-intro-flow-test.ps1
native\gbdqk-playable-flow-test.ps1
native\gbdqk-create-test.ps1
native\gbdqk-multistep-flow-test.ps1
native\gbdqk-dispatch-flow-test.ps1
native\ccecl-dqk-vmrun-test.ps1
native\ccecl-dqk-combat-test.ps1
native\ccecl-dok-combat-gap-test.ps1
native\ccecl-dok-thief-matrix-test.ps1
native\ccecl-dok-static-combat-scan.ps1
native\ccecl-dok-b51-state-scan.ps1
native\ccecl-dok-route-scan.ps1
native\ccecl-dok-chained-step-scan.ps1
native\ccecl-dok-b51-provenance-scan.ps1
native\ccecl-dok-b51-watch-test.ps1
native\dok-retail-hoststate-scan.ps1
native\ccecl-buck-entry-scan.ps1
native\ccecl-buck-chained-step-scan.ps1
native\gbdqk-combat-flow-test.ps1
native\gbboot-create-test.ps1
native\gbdok-create-test.ps1
native\gbcoab-flow-test.ps1
native\gbnwn-flow-test.ps1
native\gbdqk-amiga-glib-flow-test.ps1
native\gbsecret-hlib-flow-test.ps1
native\gbsecret-glib-flow-test.ps1
native\gbgateway-glib-flow-test.ps1
native\gbbuck-flow-test.ps1
native\gbbroader-flow-test.ps1
native\gbdqk-flow-test.ps1
native\gbflow-test.ps1
native\gbdok-flow-test.ps1
native\gbdok-camp-rest-flow-test.ps1
```

Use `native\test.ps1` for the normal native gate. The normal gate includes
format/effect/render tests, GBSN/GBST cross-process session persistence,
CoK and DoK SMUS-to-GBM1 PC-speaker playback,
optional DQK XMI-to-GBM1 music-only playback, and CoK/DoK lossless GBPR
load/create/import checks before the broader GBBOOT
detector smoke. Add `-FlowSmoke` when you want the focused no-focus
flow and native-runtime canaries run serially after that normal gate, or `-FlowOnly`
when you want just that focused layer. `-EngineSmoke` also runs the
CoK and DoK playable boot-to-gameplay canaries, DQK playable/multistep/dispatch/
combat canaries, the optional NWN, Curse/CoAB, DQK Amiga GLIB, Pool preview,
Secret raw-GEO plus Secret GLIB ECL/GEO, Gateway GLIB ECL/GEO, and Buck
real-data canaries, and the broader synthetic
Pool/Secret/Gateway/Treasures/POD/Buck/Matrix title/native-party combat canary
when `-FlowSmoke` is not already running the full flow set. These cover CoK
title/music/create/exploration/combat/post-combat exploration, DoK
title/music/create/exploration plus empty-combat resume and a created-party
seeded ECL2 block-51 queued tactical handoff through `CCCOMBAT`/`GBCR` plus
post-combat exploration, the
pinned block-36 random-selector trace proof that the normal branch exits before setup or its
adjacent tactical `GOTO`, a Gen1 vmRun1 facing-seed branch, and two direct
GBBOOT-owned tactical combat/resume probes, plus the seeded ECL2 block-51
GBBOOT `/1` vmRun1 queued combat/resume probe, its selected-player GBPS v2
thief-matrix proof, and its static ECL/GEO descriptor audit, DQK
  title/QSV/exploration/vmRun1, ordinary area-5 ship-gate/fisherman special
  steps, natural area-5 combat/resume/post-combat exploration, and explicit slot-3 combat/resume, and the
current CoAB title/create/natural movement-to-combat/resume proof when the
local extracted data is present, the optional Buck Rogers Countdown
Amiga/WHDLoad data-only party/front-door preview, area-3 natural
movement-to-combat/resume, and post-combat preview reload proof when that local
data is present, plus the optional Neverwinter Nights
  title/create/default-preview, seeded ECL7 combat/post-combat continuation,
  natural ECL0 movement/text-step, natural area-1 descriptor-229
  movement-to-combat/resume, and post-natural-combat bounded continuation proof
  when the local NWN archive extraction is present. The
shortest primary-game playable *attempt* is
`native\gbplayable-suite-test.ps1 -CoreOnly`, which runs the CoK/DoK/DQK
playable canaries plus DQK native `/R` create-to-combat canary sequentially.
The earlier 2026-09-05 core-suite failure is historical. The current full flow
sweep (2026-10-04) records 36 scripts with 31 PASS, 3 FAIL and 2 SKIP; both
remaining DQK natural-combat trace failures and the DoK GameLink singleton
guard are tracked separately above. The core runner now forwards `-Headless`
to its children.
Without `-CoreOnly`, the same suite also
checks the optional Curse/CoAB, NWN, DQK Amiga GLIB, Pool preview, Secret raw-GEO,
Secret GLIB ECL/GEO, Gateway GLIB ECL/GEO, and Buck real-data
flows; add `-Headless` to forward no-focus DOSBox mode to those optional
scripts. Do not
parallelize it with other native flow scripts because the flow tests share
`native\build` sidecars.
DoK route-discovery scanner remains opt-in because it is intentionally broader
than a normal flow smoke: use `-RouteScanOnly -RouteScanSeedCount <n>` to run
`ccecl-dok-route-scan.ps1` through the shared runner without paying for the
normal or flow gates, or add `-RouteScan` to append it after another gate. The
plain route-scan path stays baseline/no-matrix; `-DokCombatAuditOnly` uses the
matrix-aware variant so the durable DoK audit includes current GBPS v2 party
data. The
default runner seed count is small for quick regression checks; the scanner
itself still accepts `-SeedCount 256` for the broad 102,400-route audit.
Use `-DokCombatAuditOnly -RouteScanSeedCount <n>` when you want the durable DoK
status evidence in one pass: it runs the focused ECL2 block-51 host-state matrix
first (`_DOKB51STATE.*`), the static ECL/GEO candidate audit second
(`_DOKSTATIC.*`), then the broad matrix-aware runtime route audit
(`_DOKROUTE.*`), the all-area/all-GEO-block/nonzero-descriptor chained
vmRun1->SearchLocation audit (`_DOKCHAIN.*`), and the matching block-51 gate
provenance audit (`_DOKB51PROV.*`),
without
the normal or flow gates.
The
wrapper,
`native\gbboot-test.ps1`, and focused smoke scripts that use
`native\dosbox-smoke.ps1` default to the shared headless/no-focus DOSBox path:
non-visible runs route through SDL dummy video/audio on builds that support it.
Pass `-Visible` when an interactive DOSBox window is needed for debugging.
The wrapper runs the smoke scripts serially because they share `native\build`
outputs; parallel runs can race while rewriting `.COM` files and produce false
failures. The automated smoke scripts load `native\dosbox-smoke.ps1`, which
uses a hidden window for dummy-SDL runs. If dummy SDL is disabled, it starts
DOSBox minimized and re-minimizes the SDL render window when it appears; this
avoids the repeated focus stealing from short DOSBox runs. Non-visible smoke
runs also pass DOSBox's `-noconsole` flag so the separate status window does not
pop to the foreground. Their generated configs use `cycles=fixed 50000`; the
helper overlays the same default for visible/minimized runs, and a lower
`cycles=fixed 25000` default for headless runs, so ad-hoc configs do not pin a
host CPU core. Override with `GOLDBOX_DOSBOX_CYCLES` (`inherit` keeps the
script's own config), pass `-Headless` to force dummy SDL, or set
`GOLDBOX_DOSBOX_HEADLESS=0` to fall back to minimized no-active-window launches
on DOSBox builds without a working dummy backend. That is the no-focus path; on
this bundled DOSBox, the full `native\test.ps1` gate runs this way by default.
If a long local loop is still too aggressive, lower the fixed-cycle budget for
that shell, for example
`$env:GOLDBOX_DOSBOX_CYCLES='fixed 25000'`, or use `inherit` to keep a script's
own `[cpu]` block. `gbboot-test.ps1 -EngineSmoke` uses `GBBOOT /E /X` for
map-rendering preview cases, so those runs exit naturally after writing
`_GBVIEW.RAW` instead of sleeping and force-killing an interactive CCFP walker.
The simple raw-map preview fixtures are batched in small DOSBox autoexec chunks
and then asserted from per-case preserved artifacts, reducing process churn while
staying below vanilla DOSBox's practical autoexec length limit.
The older `dosbot` visual-driving scripts now launch with the same fixed-cycle
default, lower priority, hidden status console, and minimized initial window.
Their shared capture helper first tries Windows `PrintWindow` capture without
activating DOSBox, then falls back to foreground screen capture if the SDL
window cannot render off-screen. Scripted input still has to focus the SDL
window briefly because it sends real key/click events. The individual scripts
remain useful for focused debugging, but they are not the headless native gate.

`ccefx-test.ps1` runs `CCEFX.COM` against a synthetic v9 `GBEF` record and
asserts that the DOS dump preserves header fields, `LOAD_FILES`/`LOAD_PIECES`
bridge rows, encounter/NPC handoff rows, `GBRS` resume fields, bounded
sparse-memory rows, `GBSX` opcode names, operands, decoded inline text slots,
typed `TREASURE`/`ROB`/`DAMAGE`/
`ECL_CLOCK` details, the appended `GBES` setup tail, and the appended `GBHD`
halt-diagnostic tail plus `GBCL` clock slots.

`ccecl-effects-test.ps1` also covers CCECL's fixed sparse-memory resume
capacity: a synthetic 513-cell script must halt with status `4` after saving
the first 512 cells, rather than silently dropping the overflowing write.
It also fills the 64-record `GBSX` tail with `PRINT`, then separately with a
65th `PRINT` and `DAMAGE`: each leaves the first unconsumed instruction in
`GBHD reason=0007` with its exact PC and opcode. `ccefx-test.ps1` pins the
named `script-effect-capacity` diagnostic.

`ccgeo-bridge-test.ps1` runs `CCGEO /F GEO2.DAX 0` under DOSBox with a synthetic
`GEO2.DAX` and `GBMARK.COM` copied as `CCFP.COM`; it asserts that the same
bridge used by the in-viewer `F` hotkey creates `_FPWALK.BIN` and EXECs `CCFP`
with
`_FPWALK.BIN /T /A 2 /W` when `8X8D1.DAX`, `8X8D2.DAX`, and `WALLDEF2.DAX`
are present. The same smoke also builds a synthetic HLIB `GEO.GLB` with an id
table and proves `CCGEO /B GEO.GLB 26` selects the logical 22x22 map while
`map 0` still selects the first sniffed map. It also builds a synthetic Amiga
`GLIB` GEO library with big-endian pointers/id table, proves 1024-byte raw
16x16 members and Gen2 variable-size members both resolve by logical id, and
then asserts that `/B` appends
the GEO plane2 backdrop/roof bytes and plane3 door/gateway bytes after the stable
WGRD wall-cell prefix, so old readers can ignore the tails and new CCFP builds
can gate sky rendering and pass movement through flagged door/gateway edges.
`CCGEO /C <geo> <map> <out.wgr> <x> <y>` is the combat-specific bridge: it
writes only a 10x10 WGRD crop with the stable wall-cell prefix and no optional
tails, small enough for `CCCOMBAT`'s `.COM` loader buffer.

`cccombat-test.ps1` runs `CCCOMBAT.COM /T` against the built-in synthetic
Tier-1 melee fixture with seed `4660` and asserts the exact `CCCOMB.TRC`
initiative/attack/slain/end trace. It also runs `/T 2` and `/T 3` as focused
Gen1 death-boundary fixtures: damage exactly equal to `hp+10` must leave the
target unconscious, while damage greater than `hp+10` must mark it dead.
`/T 5` runs the same overkill boundary under the DQK/Gen2 ruleset, where a
downed figure remains unconscious because the Gen1 `+10` permadeath rule is not
applied.
`/T 4` pins decoded Large-footprint melee reach: a party cell two origin cells
from a Large enemy still melees because it is adjacent to the enemy's occupied
2x2 footprint. `/T 6` pins the Large movement fit check: a Large party figure
starts out of reach, moves through open-grid cells only if its full 2x2
footprint fits without overlapping another living figure, then attacks if that
move reaches melee. `/T 7` pins the default open-grid movement allowance:
a party figure starts four orthogonal cells from melee, spends the full fallback,
and attacks in the same turn. `/T 8` pins terrain-free routing around a living
blocker: a direct path is occupied, but Dijkstra-style open-grid reachability
finds a legal adjacent cell within budget. `/T 9` pins synthetic blocked terrain:
a wall column separates both sides and prevents any close move or attack. `/T 10`
pins synthetic terrain movement cost: an expensive approach cell consumes the
budget so the mover stops there instead of crossing into melee. `/T 11` pins
per-combatant movement allowance: a move-1 party figure advances one orthogonal
cell per round while a move-0 enemy stays put. `/T 12` pins the first finite-ammo
missile slice: an archer with no movement attacks a non-adjacent foe when the
line is clear. `/T 13` and `/T 14` prove intervening bodies and synthetic terrain
block that line-of-fire. `/T 15`..`/T 17` pin the short, medium, and long missile
range-band to-hit modifiers from the TypeScript oracle. `/T 18`..`/T 20` pin
footprint-aware Large missile line-of-fire: any clear shooter/target footprint
cell pair may shoot, while terrain that blocks every pair still prevents the
shot. `move` trace lines append the destination column and row after the stable
combat columns. `/T 21` and `/T 22` pin decoded monster morale: personal HP loss
routes a monster through `status`/`flee`, while side-collapse morale makes a
personally sound survivor surrender and leave the active enemy count. `/T 23`
pins routed flee movement: a feared actor walks toward the nearest reachable
edge and only leaves once its footprint reaches the border. The same smoke runs
`CCCOMBAT.COM /F <encounter|effects.gbef> [moncha.dax|glb] <seed> [trace]
[outcome]`, which attempts the CT.7g party-wide flee command before auto-combat:
`/F 24` proves a reachable party withdraws with `party-flee escaped` and a
`draw` outcome, while `/F 25` proves `party-flee blocked` resumes normal combat.
`/T 26` pins a CT.7b damage hazard at turn start. `/T 27` pins a no-save Hold
hazard at the first entered movement cell: it stops AI routing, player Move,
and routed Flee before a later step or an enabled melee attack. `/T 28` pins basic guard readiness/reaction: an actor with no
immediate action readies guard, and a foe moving into reach is struck before its
own attack. The same smoke now also runs `CCCOMBAT /T 7 ... /C G`, proving the
first headless party-command hook: a supplied `G`/`W` command readies guard on a
party turn, `F` attempts a flee step, `P` attempts the party-wide flee command,
and `A` or script exhaustion falls back to the existing auto action. This is a command-script bridge for tests and future
UI control, not the full SSI combat menu yet. Direct `F` and `F` from Move mode
both consume the current player's remaining movement allowance; they do not
reload the figure's full `C_MOVE` budget. `/T 29` and `/T 30` pin synthetic status hazards: a no-save fear
zone forces routed flee, while a save-targeted exposure can negate that status.
`/T 31` and `/T 32` pin disabled-status behavior that spells will later feed:
held figures still count as present but skip their turns, and held guards cannot
spend a readied reaction. `/T 33` pins timed status expiry at the start of a
new round: a held figure skips while the timer is live, then acts after the
expiry trace clears the disabled flag. `/T 34` pins helpless targeting parity:
held/asleep targets are auto-hit, and Gen1 melee attacks coup-de-grace them.
`/T 35` pins the Gen2 fork: helpless targets still auto-hit, but ordinary
damage wakes a surviving sleeper instead of triggering a coup-de-grace.
`/T 36` pins the Gen2 diagonal movement fork: DQK-style diagonals cost three
half-steps, letting a move-3 actor close by two diagonals in one turn.
`/T 37` pins the ranged fork: missiles auto-hit helpless sleepers, never
coup-de-grace, and wake a survivor through ordinary damage resolution.
`/T 38` pins integer attacks-per-round: a three-attack fighter resolves all
three swings in one action and retargets if needed. `/T 39` pins the fractional
`halfAttacks=3` cadence as 2,1,2,1... across rounds, including missile ammo use.
The effect-handoff smoke also includes a commit-safe CoAB-shaped `MONnCHA`
record proving native CCCOMBAT reads the full Player-layout half-attack byte at
`0x11C`, another CoAB-shaped record proving attack2-only damage profiles are
selected coherently from the verified `0x19E..0x1A3` tail, another CoAB-shaped
record proving populated attack2 damage is spent as a secondary melee strike
when attack1 is also present, plus a synthetic DQK compact short-tail
`MONCHA.GLB` record proving the
native DQK importer reads the compact attack-count byte at `ability+0x2A`
(`A+42`) for HYDRA-style records. A synthetic DoK-style `GBPR` party import also
proves `GBD1` level/class warrior records feed the same `halfAttacks=3` cadence
through `/P`. CoK, DoK compact `MON1CHA`, and non-compact
DQK attack-count sources remain on fallback values until their import-side fields
are located. Decoded movement-rate
offsets, real decoded missile loadouts, automatic host-side encounter-map terrain wiring,
spells, turn undead, and the interactive combat menu remain later work.
It also runs `CCCOMBAT.COM /V <encounter>
<seed> [raw]` and `CCCOMBAT.COM /V <effects.gbef> [moncha.dax|glb] <seed>
[raw]`, which render a minimal mode-13h tactical viewport (open grid, green
party blocks, red enemy blocks) and, when `[raw]` is supplied, write `u16 width`,
`u16 height`, 64,000 framebuffer bytes, and a 768-byte palette for oracle
checks. It also runs a synthetic ECL block through `CCECL /E`, then feeds the
resulting stable-prefix `GBEF` combat payload to
`CCCOMBAT.COM /E <effects.gbef> [moncha.dax|glb] <seed> [trace] [outcome] [raw] [/R result.gbr]`. `/E` validates
the `GBEF` COMBAT yield and expands queued `LOAD_MONSTER` groups into the
native Tier-1 combat loop. Effect-expanded enemies use deterministic right-side
slot anchors: the first three keep the original adjacent cells and later groups
no longer stack on those same cells. `/E` writes `CCCOMB.TRC` by default or the
supplied trace path when present; when `[outcome]` is supplied it writes the
terminal result as `party`, `enemy`, or `draw`; when `[raw]` is supplied it also
writes the pre-resolution tactical viewport frame; when `/R` is supplied it
writes a binary `GBCR` v1 outcome/XP/final-party-state sidecar; when
`/W <walls.wgrd>` is supplied it imports fully solid WGRD cells as blocked
tactical terrain; and when `/W` is omitted it probes a same-stem `.WGR` beside
the `/E` effect file. The commit-safe smoke also
feeds `/E` an overlarge synthetic `GBEF` and asserts the handoff clamps to eight
groups and the 32-combatant array limit (two party members plus thirty enemies)
before running to a normal trace/outcome/RAW result whose enemy blocks render as
separate slot placements, and runs a synthetic WGRD blocker against a scripted
`/E` GBEF party-flee comparison to prove `/W` changes both trace and outcome.
It also proves the same blocker through the default `.WGR` probe with no `/W`
argument.
The `GBBOOT /E` create-flow smoke additionally covers the Gen1 handoff by
baking `_GBWALL.BIN` from a synthetic GEO block and verifying that
`CCCOMBAT /E` blocks movement from that baked sidecar.
With a Gen1 CoK 409-byte `MON*CHA.DAX` archive, it decodes
real HP/THAC0/AC/damage/XP by monster id. With a Curse/CoAB 422-byte
`MON*CHA.DAX`, it decodes the local Player-layout runtime HP/THAC0/AC/damage
fields, including attack2 damage when attack1 is empty, and the XP low word;
when both attack1 and attack2 are populated, it preserves attack2 as a secondary
melee strike. The optional real-data smoke covers CoAB area 5 block 50 through
`ECL5.DAX -> MON5CHA.DAX`. With a DoK 216-byte compact
`MON*CHA.DAX`, it decodes the verified THAC0/AC/damage/combat-footprint
fields, plus hit points and kill XP from their own verified offsets: max HP at
`+40` (mirrored at `+214`), the live/rolled value at `+108`, and
`award = u16le(+109) + u8(+111) * u8(+108)`.

**CORRECTED 2026-09-05.** This sentence read "and uses deterministic HP with
zero XP because DoK compact HP/XP offsets remain unlocated in the project
loaders." That had been false since 2026-08-19, when
`docs/engine/research/dok-kill-xp.md` was marked **LOCATED** with all three
offsets VERIFIED against retail bytes and DoK's own `calc_battle_exp`
(`GAME.OVR 0x4C1B..0x4F14`) disassembled doing exactly this arithmetic. For
those six weeks `cccombat.asm` derived HP from the monster *index*
(`fx_monster & 7, + 4`) and stored a hard zero to `C_XP` behind a comment
repeating the stale claim, so **DoK awarded no experience for any kill.** The
same pass found CoK's sibling branch reading only the flat term at `+304` and
ignoring the per-hit-point multiplier at `+306`; measured across all 88 retail
CoK records that under-awarded **16,847 of 61,539 XP, 27.4%**, on 85 of them.
Re-verified independently on 2026-09-05: 64 DoK records, awards 89..14550,
Spearman +0.83 against hit dice, and of 215 candidate u16 offsets only `+109`
survives adding either a magnitude-spread or a correlation-sign criterion to a
plausibility band. The commit-safe CCCOMBAT
smoke now includes a synthetic DoK compact archive that exercises those
verified offsets, including one Large 2x2 tactical RAW block, without depending
on a local installed DoK archive. With DQK `MONCHA.GLB`, it resolves the
member-0 id table and decodes canonical fixed-offset type-8 monster records,
records whose stat tail needs the second `monchaRLE` reconstruction pass, and
raw dec-path records whose expanded ability/stat block survives in the
decompressed member (HP from average hit dice, plus real THAC0/AC/damage/XP).
Loading an HLIB `MONCHA.GLB` also switches CCCOMBAT to the verified DQK/Gen2
death rule, so overkill downs are traced as unconscious rather than Gen1
permadeath.
It also accepts DQK's character/NPC-framed records with stored HP/THAC0/AC and
the loader's nominal `1d2`/zero-XP combat placeholders.
The real-data smoke pins the original fixed-offset handoff, DQK ids 16 and 17
(`GIANT ANEMONE`, `GIANT SQUID`) through the raw dec-path, DQK ids 23 and
18 (`IRON OLEM`, `SAUAGIN`) through the reconstructed path including a
monster-framed non-type-8 record, DQK ids 10 and 12 (`HYDRA`, `UMBERHULK`)
through the compact short-tail/canon-AC fallbacks, and DQK ids 55 and 64
(`BAKAI SHAMAN`, `SHARMAN`) through the NPC-framed stored-HP path.
**⚠ 2026-08-21 (fidelity-plan §29):** those names and paths describe the **superseded**
`MONCHA.GLB` decode, which read each member from byte 0 and so consumed its 2-byte
big-endian length word as RLE control bytes. The records really read `IRON GOLEM`,
`SAHUAGIN`, `UMBER HULK`, `BAKALI SHAMAN` (a monster, not a cleric), and `SHARMAN` is not
a record at all; the "type-8 byte" the framing split keys on does not exist (offset 2 is
inside the length word); the `reconstructDqkRecord` path has nothing to reconstruct; and
the canon-AC fallback is **retired** — UMBER HULK's AC 2 is on disk. The TypeScript oracle
was corrected in `df69707`; check `native/src/cccombat.asm` and `native/src/ccmon.asm` for where
the native path currently stands before quoting any of the names or counts above. See the CCMON
section's superseded-decode banner.
Roster-only category relabels with no decoded combat stats are still skipped
rather than guessed. Without a monster archive, it uses deterministic
placeholder enemy stats.
`native\cccombat-glib-moncha-test.ps1` is the optional real-data smoke for the
local Secret/Gateway Amiga GLIB monster archives. It stages Secret
`DISK2\MONCHA.GLB` and Gateway `DiskB\MonCha.glb`, feeds each through a
synthetic `GBEF` combat handoff, and verifies `CCCOMBAT` writes a trace,
outcome, and nonblank tactical RAW. `CCCOMBAT` now accepts GLIB monster
containers by swapping their big-endian pointer metadata and id-table words.
Gateway's raw 422-byte members and Secret's compact members are resolved from
the archive before combat, but their game-specific combat stat offsets are not
pinned yet; they use the same deterministic placeholder tactical stats as the
no-archive path until those layouts are decoded.
`native\gbsecret-glib-combat-flow-test.ps1` separately proves the Secret path
from real GLIB ECL into that GLIB MONCHA importer through `GBBOOT /E`, using a
direct-entry area-16 combat island rather than a synthetic `GBEF` fixture.

`gbboot-test.ps1` also builds `src\gbmark.asm`, copies that tiny recorder under
synthetic game executable names, and proves the real DOS `EXEC` path launches
the selected child for each concrete boot branch. The recorder asserts command
tail preservation for Gateway's `UseStart` and DQK's `SB220 SI7 RB330`
defaults, verifies direct `GAME` wrapper layouts for CoK, DoK, Pool, Curse,
Secret, Gateway, Treasures, Pools of Darkness, Buck Rogers Countdown, and
Matrix Cubed, the named nested re-release wrapper layouts for Pool, Curse,
Secret, Gateway, Treasures, Pools of Darkness, Buck Rogers Countdown, and
Matrix Cubed plus generic `GAME\DQK.EXE` and data-only `GAME\DISK3` DQK
disk-layout wrappers, and records the native
`GBBOOT /E` CCECL command tail and generated `GBPS` sidecar bytes to prove
`/I`, `/F`, `/M`, `/K`, `/S`, `/P`, `/H`, and `/Q` are forwarded through the
compact `_GBSEED.BIN`/`CCECL /G` handoff instead of expanding into an overlong
DOS PSP command tail, while `/L`, `/C`, `/Y`, `/O`, and `/W` remain direct
`CCECL /L`, `CCECL /C`, `CCECL /Y`, `CCECL /O`, and `CCECL /W` headless
selection seeds. The exact CCECL tails also require `/ID 1`, `/ID 2`, or
`/ID 3` alongside the corresponding v2 roster. It also proves CoK/DoK save-slot counts plus DQK
`SAVGAM[A-J].QSV`/`SAVGAME.QSV`/QCH discovery, including GOG-root
`cloud_saves\SAVE` fallback layouts and B/C cloud slot families where verified,
can populate the same sidecar automatically. `ccparty-test.ps1` separately
proves the matching materialization path by withholding QSV, loading generated
loose DQK `CHRDATA*.QCH` files through `CCPARTY /Q`, verifying the resulting
six-row compact `GBPR`/`GBD1` metadata, and importing that roster into
`CCCOMBAT /P`.

`gbboot-test.ps1 -EngineSmoke` resolves CoK Amiga art from the local extraction
or the documented WHDLoad `ChampionsOfKrynn\data` directory. Pass
`-CokAmigaPath <directory>` to select another held release; that directory must
contain `8X8D1.DAA`, `CPIC1.DAA`, and `BIGPIC1.DAA`. The harness copies assets
into scratch space and gives each resolved source path its own mirror. Missing
assets fail setup without skipping the artwork assertions.

The 2026-10-02 headless run passes detection/chainload, all three menu-resume
cases, and the CoK Amiga resource/scene checks. The complete engine smoke still
fails at the direct GAME Pool wrapper because `_GBWALL.BIN` is absent; later
combat/writeback cases remain beyond that failure boundary.

The engine smoke then exercises the native `/E` chain. Combat-only
cases include the plain CoK-style handoff, a DoK-profile handoff with a
synthetic 216-byte compact `MON1CHA.DAX`, and the `/E /X` tactical snapshot path; map-rendering
cases run through `/E /X` and assert the `_GBVIEW.RAW` snapshot. Both map and
combat RAW assertions reject empty framebuffers, so a zeroed renderer cannot
pass by only writing a valid header. Wall-seeded HLIB fixtures and selected
DQK starts also require high-palette wall-art pixels in `_GBVIEW.RAW`, so a
boot path that generates `_GBWSET.GBW` but silently renders the outline
fallback cannot pass for visible-wall GBWS cases. DQK `/A 18` also asserts that
the real boot-path `ECL_CLOCK`/`GBCL` tail paints the native sky band in the
GBWS first-person snapshot. Coverage includes CoK, CoK `/A 2`, CoK `/A 3`,
CoK data-only, DoK, DoK `/A 2`, DoK `/A 3`, DoK data-only,
original-layout DQK, nested `GAME\DQK.EXE` original-layout DQK,
original-layout DQK data-only, nested original-layout DQK data-only, plus DQK `/A 2..5`, `/A 7`, `/A 10`, `/A 14`, `/A 18`, `/A 22`,
`/A 26`, `/A 30`, `/A 34`, `/A 38`, `/A 42`, `/A 46`, `/A 50`, `/A 54`,
`/A 62`, and `/A 66`,
synthetic CoK-style `MON1CHA` and `MON2CHA` combat-yield encounters, a
synthetic DoK compact `MON1CHA` combat-yield encounter that proves `GBBOOT`
selects the area monster archive and `CCCOMBAT` consumes the verified compact
THAC0/AC/damage offsets (and, since 2026-09-05, the verified HP and kill-XP
offsets too -- this clause read "without inventing HP/XP fields", which was true
of the *offsets* but concealed that HP was being invented from the monster
index and XP hardcoded to zero), CoK and DoK roster
writeback fixtures that compare `_GBPARTY.GBP` against `_GBCR.BIN`, synthetic default
`ECL1.DAX` entry-34 and explicit `/B 34` combat-yield encounters for Pool,
Secret, Gateway, Treasures, Pools of Darkness, Buck Rogers Countdown, and Matrix
Cubed proving broader Gen1 profiles can route their verified area-1 ECL start
through `CCCOMBAT`, `/B 34` fixtures for those same broader Gen1 profiles that
create three native party members with `/R`, import them into `CCCOMBAT`, and
write the defeated party state back through three-row `GBCR` bridges, broader
`/J` title-front-door plus native-party combat handoffs that keep title playback
and tactical combat as separate launched helpers, a
combat-only `_GBCOMB.RAW` snapshot,
synthetic combat-then-map encounter with `LOAD_FILES` preserved through combat,
a synthetic combat-outcome-resume encounter whose post-combat defeat branch
loads the map,
synthetic raw-`GEO*.DAX` fixtures for Pool, Secret, Gateway, Treasures, Pools
of Darkness, Buck Rogers Countdown, and Matrix Cubed, profile-specific `/A 2`
raw-map overrides for that broader named-profile set when `GEO2.DAX` is
present, ECL-backed direct `GAME` CoK/DoK/Pool/Curse/Secret/Gateway/Treasures/
Pools of Darkness/Buck Rogers Countdown/Matrix Cubed wrappers, direct `GAME`
CoK/DoK data-only wrappers, ECL-backed nested Curse wrapper previews through
`GAME\CURSE\ECL2.DAX` and `/A 3` `GAME\CURSE\ECL3.DAX`, plus ECL-backed nested
Pool, Secret, Gateway, Treasures, Pools of Darkness, Buck Rogers Countdown, and
Matrix Cubed executable wrappers,
direct `GAME` data-only wrappers for Pool, Curse, Secret, Gateway, Treasures,
Pools of Darkness, and Matrix Cubed, plus their `GAME\<shortname>`
wrapper-root layouts including `/A 2` raw-map overrides for the nested Pool,
Secret, Gateway, Treasures, Pools of Darkness, Buck Rogers Countdown, and Matrix
Cubed wrappers, synthetic
`ECL1.DAX`/`GEO1.DAX` default and `/B 34` override fixtures for Pool, Secret,
Gateway, Treasures, Pools of Darkness, Buck Rogers Countdown, and Matrix Cubed,
matching executable-less ECL-backed data-only fixtures for Pool, Secret,
Gateway, Treasures, Pools of Darkness, and Matrix Cubed in both root and direct
`GAME` wrapper layouts, plus their nested `GAME\<shortname>` data-only wrapper
layouts, a generic Gen1 data-only dump including
`/A 2` and proving `_GBVIEW.RAW` is written beside `GBBOOT.COM` instead of
`CCFPVIEW.RAW` in the game directory, named executable-less Pool, Curse,
Secret, Gateway, Treasures, Pools of Darkness, and Matrix Cubed marker fixtures
plus matching nested `GAME\<shortname>` data-only wrappers that preserve their
specific game names while taking the native-only raw-map path, a GEO2-only data
dump, a synthetic
FRUA-style raw-`GEO.GLB` fixture, the same raw-map path through a nested
`GAME\CKIT.EXE` + `GAME\SCRIPT.GLB` wrapper, a nested native-only
`GAME\GEO.GLB` wrapper, the same FRUA marker path upgraded with real local DQK
`8X8DB/C.TLB` wall art,
a real-art CoK data-only `GEO1/WALLDEF1/8X8D1` raw textured fixture, a real-art
CoAB data-only `GEO2/WALLDEF2/8X8D1/8X8D2` raw textured fixture when the local
dump is present,
a synthetic executable-less HLIB raw-`GEO.GLB` fixture including `/A 2`,
the same raw HLIB fixture upgraded with real local DQK wall TLBs,
an optional Gateway-profile `/A 2` raw-map fixture upgraded with real local CoAB
Gen1 texture art when that dump is present,
original disk-layout DQK, nested `GAME\DQK.EXE` disk-layout DQK, DQK `/B 18`
as a direct HLIB ECL entry override, native-only
original disk-layout DQK, nested native-only `GAME\DISK3` DQK data, flat
generated-layout DQK, native-only flat DQK data,
a synthetic generated-DQK entry-stub `NEWECL` chain, a synthetic generated-DQK
`LOAD_PIECES 10` case proving `8X8DC.TLB` wall-set selection, and the local `coab_extracted\Data` Curse/CoAB
chapter archives mounted directly as a data-only native profile when that dump
is present: default area 2 plus `/A 3`, `/A 4`, `/A 5`, and `/A 6` all run
through real ECL, GEO, WALLDEF, and 8X8D data. Additional real CoAB `/B`
override starts are also covered for map-yield blocks 2/3/4, 17/21, 34/37,
50/51/53, and 66/67/69. Area 5 block 51 now exits as a bridge-complete tactical
handoff: it preserves `LOAD_FILES`, `LOAD_PIECES`, sixteen script effects,
`GBEC` monster group `#35 x14`, `GBES` setup sprite/pic `#35`, and
`GBEF status=0003`.
The dedicated CoAB flow smoke additionally proves a natural area-2 step from
`(5,10)` east into descriptor `136`, where SearchLocation queues a bar-brawl
tactical encounter and resumes the script after CCCOMBAT. That natural leg starts
through `/J`, asserts CGB's bounded `TITLE.DAX` playback, uses `/R` to create
three Gen1 native party members, verifies they are imported into CCCOMBAT and
written through a three-row `GBCR`, then starts a second bounded launch from the
preserved session and byte-identical GBPR and steps east again to descriptor
`128` without creating combat sidecars, proving exploration can continue after
the tactical/resume leg.

This is intentionally a boot/detect layer, not yet the whole replacement game
loop. It gives the native asm track a real DOS entrypoint that can chain into
existing Gold Box installs and the generated DQK-class build directories while
the native loaders, ECL VM, renderer, and combat code continue to converge.

### Per-script status blocks were misattributed (found and fixed 2026-09-05, round 37)

Commit `42c315e` appended three per-script status blocks to the DQK section above. **All three
landed one paragraph too early**, so each was printed under the wrong script's name for one day.
Recorded here rather than silently repaired, because the failure mode is one none of this repo's
checks can see.

| status block was printed under | it actually describes | how that was established |
|---|---|---|
| `gbdqk-intro-flow-test.ps1` | `gbdqk-playable-flow-test.ps1` | the block cites the area-5 dragon selector, the six-row `GBCR`, the `CCECL /R` resume and the final `_GBVIEW.RAW`; `gbdqk-intro-flow-test.ps1` has none of those legs and no `MONSTER` needle at all |
| `gbdqk-playable-flow-test.ps1` | `gbdqk-create-test.ps1` | it says "same pin as `gbdqk-playable-flow-test.ps1` **above**", which only parses for a script listed after playable |
| `gbdqk-create-test.ps1` | `gbdqk-multistep-flow-test.ps1` | it describes a test requiring `GBPS` version 1 and reporting count 6; that is `gbdqk-multistep-flow-test.ps1:203-218` exactly, while `gbdqk-create-test.ps1:163` fails on version `-lt 2` and pins count 4 |

Both misplaced blocks also say "the description **below**", which a note following its own
description cannot mean. Likely mechanism, inferred and not measured: the
`gbdqk-multistep-flow-test.ps1` paragraph runs straight into the `ccecl-dqk-vmrun-test.ps1`
paragraph with no blank line between them, so a blank-line paragraph count is off by one from that
point backwards.

**Every individual sentence in those blocks was true.** Four runs, byte-identical `DQKPC.TXT` dumps,
a rebuild at `23ba497` -- the measurements were real and carefully done. What failed was the
*binding* of a true statement to a subject, and this repo's checks are all built to catch false
claims. A true claim filed under the wrong name passes every one of them.

It had already cost something. The round-37 flow-status artifact had to carry a `disputed: true`
entry because `CLAUDE.md` attributed the 52-day never-green finding to
`gbdqk-multistep-flow-test.ps1` while this file attributed it to `gbdqk-create-test.ps1`; the agent
that found the disagreement correctly refused to settle it without re-deriving. `CLAUDE.md` was
right. The way out was not to decide which document to trust but to read the two scripts' `GBPS`
assertions, which disagree unambiguously.

**Guard owed:** a `tools/` check that, for every per-script status assertion in this file, requires
the named script to actually contain the needle the prose says it pins. Two of these three blocks
die instantly under that rule. Not built yet; round 38 owns it.

## Features added 2026-10-07: what each does and what it does not

Written from the source files named in each bullet (read at `d4f6d0c6`), not from commit
subjects. **No DOSBox session was run for this section**, so none of these bullets is a fresh
runtime measurement. Runner membership, read from `native/test.ps1`: `cchost-npc-test.ps1`, `ccparty-test.ps1` and
`cccombat-test.ps1` are in its `$scripts` array; `gbdqk-create-test.ps1` is in `$flowScripts`
(and so is in the committed sweep, whose verdict is not quoted here); `gbboot-test.ps1` is invoked
directly. `ccflow-dqk-area2-test.ps1`, `ccfp-dqk-sound-test.ps1`, `ccecl-dqk-npc-route-test.ps1`
and `ccecl-dok-rng-test.ps1` do not appear in `native/test.ps1` at all, so no sweep has measured
them. I did not check `tools/` for other invocations of any of these.

- **CCFLOW repeated-state guard (DQK area 2).** `src/ccflow.asm` `check_state_repeat` hashes
  (32-bit FNV-1a over words) the resumable CCECL state in the paused record (area, pc, RNG, call
  stack and memory cells; **not** the replay-flag word or the events) and compares it against the
  last 128 hashes (`LOOP_RING`) at each capacity halt. A recurrence means CCECL would repeat
  forever, so since 2026-10-07 CCFLOW **publishes** instead of aborting: `loop_publish` appends the
  current chunk, rewrites GBHD reason 7 to 10 (`HALT_LOOP_DETECTED`, CCFLOW-only; CCECL emits 0-9),
  finalizes the GBSL sidecar, deletes `GBR.EFX` and exits 0. The record is CCECL's v15/status-4 view
  with FX_HAVE_SIDECAR set; CCFLOW itself cannot replay it (`validate_v15_capacity` rejects the
  sidecar flag, `is_script_full` needs reason 7). Consumers must treat reason 10 as non-terminal;
  CCHOST now accepts it only for a DQK roster and rejects forged variants, CCEFX labels it, and GBBOOT routes DQK through CCFLOW (round 8, below).
  **Limits:** only an exact state recurrence is caught; a loop whose state keeps moving still ends
  at the u16 sidecar overflow with the older "sidecar write failed" message. Area 2's INPUT_NUMBER
  loop is ended, not made playable. Exercised by `ccflow-dqk-area2-test.ps1` (checks exit 0,
  reason 10, GBSX 64, GBSL a multiple of 64, first 64 records equal direct CCECL; a NOPed-guard
  mutant was seen RED) and the area-26 control in `ccflow-test.ps1`. Figures: 14 chunks, about 1.1 s;
  ccflow.com 5,412 emitted / 56,687 resident / 8,593 free.
- **Round 8 additions (2026-10-07), each measured by its own script; the flow sweep (37 scripts) and `-EngineSmoke` (346 PASS, rc 0, run from a copy of `native/` in `C:\gbw14`) were green on this source:**
  GBBOOT routes DQK ECL through CCFLOW, so `/A 7` reaches combat at GEO 14 (28x28 wall) and resumes at GEO 62;
  only the resume tail uses the short `C:name` toolpath (seed and roster tails stay long, which keeps every
  other title's tail pins unchanged). CCHOST `/D` writes no DoK save for a DQK roster and accepts CCFLOW's
  reason-10 loop record (GBEF v15 status 4 + sidecar) only for a DQK roster; forged variants and GBHR use are
  rejected with the roster unchanged (`cchost-dqk-damage-test.ps1`). Its v1 sidecar rows use 32-bit offsets
  (cap lifted to the u16 row count; v2 and the DoK journal keep 1,213 rows), and the v15 capacity/menu checks
  read the GBRF layout from `V14_LEN` (they had rejected every real v15 record). CCEFX labels reason 10.
  CCECL reads Matrix Cubed opcode `0x4C` with two operands under `MATRIX.CFG`, so block 19 reaches GEO 17 /
  wall set 5 (`ccecl-matrix-op4c-test.ps1`). CCCOMBAT's encounter dispatch is table-driven (+936 bytes) and
  DoK combat uses the retail per-round initiative (`cccombat-dokinit-test.ps1`, round 1 exact against
  `tools/dok_initiative.py`; `/U` is a test hook for the surprise mask). CCPARTY `/R` reads an optional
  `_GBDICE.BIN` from the current directory (`ccparty-dqkdice-test.ps1`). `gbdqk-npc-join-test.ps1` now
  pins GBBOOT gate 20 for DQK area 27 as current behaviour (no accepted terminal route). Limits: DoK
  initiative is exact for round 1 only; the loop record's single GBSL period applies its DAMAGE once;
  `CCHOST /N` had no reason-10 check when this was written (fixed in round 9 below); the five new tests were advisory when written and were **enrolled 2026-10-07, not yet swept**: `gbdqk-npc-join-test.ps1` joined `$flowScripts` (37 -> 38 entries) and the other four joined `$scripts` (38 -> 43 entries, the fifth being `cccombat-dqkai-test.ps1`, which DQK targeting added); each prints an early `SKIP:` when DOSBox or its retail data is absent. Swept 2026-10-07 on the final round-8b source: flow **38/38 PASS**, `$scripts` **43/43 PASS** (a first `$scripts` sweep read 41/2 because `cccombat-dokinit-test` and `cccombat-dqkai-test` extracted their base revision with a Windows-path `tar -C` that MSYS tar misread as a remote host; fixed with `--force-local` and a forward-slash path, then re-swept).
- **Round 7 additions (2026-10-07), each measured in headless DOSBox by its own script, none swept yet:**
  CCCOMBAT gives a DQK party row whose GBPR body `+300` bit 7 is set (a recruited NPC) the generic
  `ai_take_turn` (`cccombat-test.ps1`; retail's AI body at `0x2DE10` is unread, so targeting is the
  generic weakest-foe rule). CCPARTY routes headless DQK `/R` creation (`/G /ID 3 /C`, no `/Q`) through
  `dqk_create` (`ccparty-test.ps1`, `gbdqk-create-test.ps1`; names 3-8 letters, Human CON 15, timer dice).
  GBBOOT runs `CCHOST /N` when CCECL records `FX_HAVE_NPC` (`gbdqk-npc-join-test.ps1`: 4 -> 5 rows; exit 2
  party-full is non-fatal and the six-hero join is blocked), starts Matrix Cubed at ECL block 16 / GEO 17
  when present (`gbboot-test.ps1`, skips without `matrixcubed_extracted`), and its title compare chains
  are one range check (`tools/test_gbboot_title_chains.py`). DoK turn order is derived, not yet native:
  `docs/engine/research/dok-initiative.md`.
- **CCFP `step_sound` (DQK walk sound).** On an allowed first-person step (after the passability
  checks, before the position advances; never on turns or blocked steps) `ccfp.asm` `step_sound`
  shrinks its memory block, EXECs `CCSND.COM /P 8 7418 DISK1\SOUNDS.GLB` with stdout sent to
  `NUL`, and regrows the block. It runs only if `DISK1\SOUNDS.GLB` opens relative to the current
  directory, so CoK, DoK and any title without that file are untouched. It is **skipped
  whenever scene or GBIM art is resident** (`gbim_valid` or `scene_valid` nonzero), because those
  buffers live in segments the EXEC would overwrite; there is no walk sound while an encounter
  or scene picture is up. Every failure (no `CCSND.COM`, no memory) is silent. `/P 8 7418` means
  member 8 at 7418 Hz; that this member is DQK's `PlaySound(0x0B)` walk sound is the source
  comment's claim from `DQK.EXE 0x43B26`, not something re-derived here. Exercised by
  `ccfp-dqk-sound-test.ps1`. Audible output is not claimed: the path hands PCM to the Sound
  Blaster driver and nothing here confirms hardware playback.
- **CCHOST `/N` (apply recorded DQK ADD_NPC joins).** `CCHOST /N <effect.GBEF> <MONCHA.GLB>
  <roster.GBPR>` (`src/cchost_npc.inc`) reads the join table CCECL records in a GBEF (v2 to v15,
  at most 8 joins), finds each NPC id through MONCHA member 0's id table, builds a compact DQK
  GBPR row (name plus GBD1 tail) and appends it to a DQK v2 compact roster of at most 8 rows (`NPC_ROWS_MAX`; **corrected 2026-10-13:** this said 6 until the 8-row GBPR change `cacffd79`). All
  joins are applied to an in-memory copy and the file is written once, so a rejection leaves the
  roster byte-identical. **Exit codes:** 0 applied, nothing to apply, or every join already on the roster (an idempotent replay, logged); 1 bad input; **2 party full**; **4 missing or undecodable MONCHA member**; 3 is retired. **Corrected 2026-10-13:** this listed "3 duplicate NPC"; since `5bd60d15` a duplicate exits 0 (`cchost_npc.inc` header and `npc_skip_dup`). **Marker bytes:** body
  offset +300 (row offset 301) holds `(morale / 2) or 80h`, the value retail ADD_NPC stores at
  record `+0x9B`, and body offset +301 holds the NPC id, both in otherwise-zero tail padding; the
  duplicate check keys on flag bit 7 plus the name. New rows take the first free native slot 80h
  to 85h. **Limits:** the single write is one DOS write that only extends the file, not a
  crash-safe transaction. **Corrected 2026-10-13:** this said "It is a standalone mode: GBBOOT does not call it"; `apply_npc_joins` in `gbboot.asm` execs `CCHOST /N` for DQK whenever the effect carries `FX_HAVE_NPC`, treats exit 2 as a reported, deferred join and any other nonzero status as fatal. Duplicates are skipped here (logged), as retail skips them at script level (next bullet). Exercised by `cchost-npc-test.ps1`, whose expected row bytes come from an
  independent PowerShell MONCHA decoder.
- **CCECL opcode `0x37` LOAD_PIECES in DQK is a party lookup.** In Gen2 (`loadpieces_gen2`,
  `ccecl.asm`) the two-operand `0x37` records its script effect as before, then, if a `/B` party
  is loaded, scans the party for a member whose name (length-prefixed, body +0) equals the string
  at memstr operand 1 **and** whose NPC flag byte (body +300, carried in `party_ext`) has bit 7
  set. It stores the party index, or 255 when absent, in the operand-2 cell. With no party loaded
  the destination cell is left untouched. Retail's routine is `DQK.EXE 0x434A8` per
  `docs/engine/research/dqk-add-npc-route.md`; this implementation follows that document and was
  not independently disassembled here. The research note says retail also sets bit 7 of the
  stored index when record `+0x18B` is zero; the native lookup stores the plain index and does not
  model that. Exercised by `ccecl-dqk-npc-route-test.ps1`. It makes the
  area-27 `ADD_NPC` guard evaluable; it does not itself add anyone to the roster.
- **CCPARTY `/Q /C` and `/Q /M` creation (DQK).** `CCPARTY /Q /C <name> <class> [/R race]
  [/N con] [/D dicefile] [out.gbpr]` (`src/dqkcreate.inc`; this `/N` is Constitution and is
  unrelated to CCHOST `/N`) builds a 414-byte record at 1,000,001 XP with the first-level HP
  helper and the XP-driven level-up loop under racial caps, writes it to `SAVE\<NAME>.QCH` and
  appends a native row (slot 80h to 85h). Rejected before anything is written: name not 3 to 8
  letters, class not one of `C K F R M T` (cleric, knight, fighter, ranger, mage, thief), race
  above 6 (default 6, Human), CON above 25 (default 15), a party already at 6, or a race whose
  cap for the class is below 2. **The dice are not the retail random generator:** they are a `/D`
  byte file (each byte mod the die, cycled) or a local LCG seeded from the BIOS tick, so two runs
  without `/D` differ and no claim is made that a retail character would roll the same. Ability
  scores are fixed defaults. **Not modelled:** spells, equipment, saving throws, thief skills,
  multiclass characters, and paladins (no `P` class letter). With `/Q /M`, `C` prompts for name,
  class, race and CON, re-prompting on invalid input, and is intended to match `/C` byte for byte;
  `ccparty-test.ps1` compares the two for one fighter case, so equality for other classes is not
  shown. The HP rules follow `tools/dqk_character_rules.py`, this project's model of the
  overlay-11 code, not a retail run. Also exercised by `gbdqk-create-test.ps1`.
- **DoK uses the CoK Borland RNG.** `ccecl.asm` now has a `use_cokrng` flag, set in both the CoK
  and DoK dialect branches and cleared otherwise; `op_random`'s bounded draw and `roll_d6` take
  the Borland-recurrence path (`cr_bounded`) when it is set. Other titles keep the legacy
  generator. The expected draws in `ccecl-dok-rng-test.ps1` come from `tools/dok_rng.py`
  (independent of the assembler). **Limit:** this covers the ECL `RANDOM` opcode and ECL
  `roll_d6` only. It does not claim CCCOMBAT's damage or initiative rolls use it for DoK, and
  the evidence that DoK shares CoK's recurrence is `docs/engine/research/dok-rng.md`, not a DoK
  retail trace re-derived here.
- **CoK movement from record bytes.** `cccombat.asm` sets an enemy's movement from the MON
  record byte at `+0xD5` (`monraw+213`) and a CoK party member's from character byte `+0x198`
  (body offset 408), both through `clamp_move_al`: a value outside 1 to 96 becomes 1. This follows
  `GAME.OVR` CalcMoves `0x14EB7` as cited in `docs/engine/research/cok-monster-move.md`; I did
  not disassemble it. The party path applies when the GBPR identity is CoK (`party_dok` is 0);
  DoK and DQK rows keep the fixed `DEFAULT_MOVE_CELLS` fallback. Exercised by `cccombat-test.ps1`
  (`tools/test_cok_monster_move.py` is the enemy-side Python model). Only the movement allowance
  changes; pathing and initiative are as before.
- **GBBOOT accepts the Gen2 capacity-saturation GBEF.** `read_effect_header` in `gbboot.asm` now
  accepts a v15 effect record whose status word (offset 8) is 4, the record CCECL emits when a
  Gen2 script's effect count reaches `SCRIPTCAP` (64) and the VM halts instead of truncating
  silently. Before, any v11 to v15 record with a status other than 2 was rejected and the boot
  produced no wall at all. **Limit, stated plainly:** acceptance is not continuation. There is no
  Gen2 capacity-continuation path, so a saturated area stops at its capacity record: DQK `/A 7` is
  now pinned in `gbboot-test.ps1` to that honest state (status 4, 22x22 wall, no resume) rather
  than the 28x28 combat-then-resume route, which stays open as
  `docs/engine/NATIVE-TASKS-2026-09-12.md` records. Do not describe the DQK matrix as fully
  passing.

## Diagnostic tools (standalone, not wired into `cc.ini`)

`src/ccdat.asm` (`build\ccdat.com`) is a clean-room parser/dumper for the SSI Gold
Box game-data record formats, mirroring the project's verified TypeScript loaders
(`packages/engine/src/loaders/{monster,savedCharacter,item,dqkSave,dqkItem,
monsterSideTables}.ts`) — every offset comes from those loaders, not fresh
reversing. It prints labelled decimal fields to stdout so the output can be
diffed against the TS oracle. Run directly (`ccdat.com <verb> <file> [index]`);
it isn't a `cc [open]` extension.

| Verb | Args | Reads | Mirrors |
|------|------|-------|---------|
| `M` | `<dax> <i>` | DAX block `<i>` → 409-byte (CoK), 422-byte (CoAB), or 216-byte (DoK) monster record | `monster.ts` |
| `C` | `<sav>` | raw 409-byte `CHRDATA{n}.SAV` record | `savedCharacter.ts` |
| `I` | `<dax> <i>` | DAX block `<i>` → 63-byte CoK item record(s), ASCII-named | `item.ts` `decodeItemArchive` |
| `J` | `<dax> <i>` | DAX block `<i>` → 17-byte DoK item record(s), VOCAB-coded | `item.ts` `decodeDokItemArchive` |
| `Q` | `<qsv>` | raw DQK `SAVGAMA.QSV` global-state header (no DAX) | `dqkSave.ts` `decodeDqkSaveHeader` |
| `T` | `<dat> <i>` | raw DQK `ITEMS.DAT`, one 16-byte base-item catalogue record `<i>` | `dqkItem.ts` `decodeDqkBaseItem` |
| `N` | `<dat> <i>` | raw DQK `item.dat`, one 18-byte per-instance item record `<i>` | `dqkItem.ts` `decodeDqkItemRecord` |
| `S` | `<dax> <i>` | DAX block `<i>` → `MON{n}SPC.DAX` flat array of 9-byte special/affect record(s) | `monsterSideTables.ts` `decodeMonsterSpcArchive` |
| `K` | `<dax> <i>` | DAX block `<i>` → `MON{n}ITM.DAX` flat array of 63-byte monster carried-item record(s) | `monsterSideTables.ts` `decodeMonsterItmArchive` |
| `Z` | `<dax> <i>` | DAX block `<i>` → `MON{n}WIZ.DAX` 220-byte monster spellbook record, decoded as the verified 0..73 memorized-spell list | `monsterSideTables.ts` `decodeMonsterWizArchive` |
| `G` | `<gam>` | raw DoK `CHRDATA{n}.GAM`, 216 bytes | `dokSavedCharacter.ts` `decodeDokSavedCharacter` |
| `V` | `<jnk>` | raw DoK `CHRDATA{n}.JNK` inventory, 63-byte-per-item records | `dokSavedCharacter.ts` `decodeDokJnkFile` |
| `W` | `<wiz>` | raw DoK `CHRDATA{n}.WIZ`, 220 bytes (spell record, PARTIAL) | none yet — see doc below |
| `E` | `<eff>` | raw DoK `CHRDATA{n}.EFF`, 9-byte-per-affect record(s) | none yet — SAME layout as `S`'s `MON*SPC.DAX` record |

For `M`/`I`/`J`/`S`/`K`/`Z` the index selects the **DAX TOC entry**, not a sparse
block id or an item within it — the matching print routine then dumps the
selected monster record or every record found in that block
(mirroring the TS archive decoders, which decode a whole block's worth of
records per call). For `T`/`N` the index selects the record directly
(`index * record_size` into the raw file). All seven of `J`/`Q`/`T`/`N`/`S`/`K`/`Z`
were verified headlessly against real shipped files (`Death Knights of
Krynn\ITEM0.DAX`, `The Dark Queen of Krynn\SAVGAMA.QSV`, `The Dark Queen of
Krynn\DISK1\{ITEMS.DAT,ITEM.DAT}`, and — for `S`/`K` — real `MON1SPC.DAX`/
`MON1ITM.DAX` from both `Champions of Krynn\` and `Death Knights of Krynn\`,
plus real `Death Knights of Krynn\MON1WIZ.DAX` block id 97 for `Z`) with zero
field mismatches vs. the TS loaders.
`M` is covered by `ccdat-test.ps1` with a commit-safe synthetic CoAB 422-byte
record, including the verified Player-layout `halfAttacks` byte at `0x11C`,
and, when the local `coab_extracted\Data` dump is present, real `MON5CHA.DAX`
SALAMANDER / DK ELF FIGHTER records.

`S`/`K`/`Z` letters: `I` and `J` were already taken (CoK/DoK generic item
records), so `K` continues that item-verb family for the monster-side carried-
item table; `S` is mnemonic for "special/affect" (the `MON{n}SPC.DAX` file
suffix), and `Z` is the remaining single-letter verb for the DoK-only
`MON{n}WIZ.DAX` spellbook table because `W` is already the raw player-save
evidence printer. These DAX side-table verbs print a `blockId(monsterId): <n>` line before the record
dump — `MON{n}SPC.DAX`/`MON{n}ITM.DAX` key each block by the **monster's id**
(COAB `load_mob`), which is a sparse value, NOT the same as the DAX TOC's
positional block index `<i>` the verb argument selects (verified on real
files: e.g. `Champions of Krynn\MON1SPC.DAX` TOC index 0 has block id 1, index
1 has block id 4, ...) — so the printed id is what actually correlates to a
monster record in the matching `MON{n}CHA.DAX`. `K`'s 63-byte record is the
SAME `Item.StructSize` struct the `I` verb reads (COAB-confirmed), but unlike
`I` it does not treat byte 0 as a name-length sniff/stop gate (the leading
name region is scratch here) — it decodes every record in the block
unconditionally, at the identity/stat fields from `0x2e` on, exactly like
`decodeMonsterItmArchive`. Two fields recovered at their documented offsets
(`hiddenNamesFlag`@0x35, `cursed`@0x36) are printed as **raw bytes**, not
booleanized, because the TS oracle only pins them as byte offsets, not
booleans — confirmed necessary on real data (`Death Knights of Krynn\
MON1ITM.DAX` block id 50 has several records with `raw[0x35]=4`, not 0/1).
`Z` validates that the selected block is exactly 220 bytes, then prints each
nonzero byte in offsets 0..73 as a `memorizedSpell` slot with `spellId`
(`byte & 0x7f`) and `learning` (high bit) fields, matching
`decodeMonsterWizRecord`. The remaining bytes are player-save-only or
unresolved sub-regions and are deliberately not decoded by this monster-table
verb.

### `G`/`V`/`W`/`E`: the DoK `CHRDATA{n}` save quad

New verbs for the per-character save files Death Knights of Krynn writes to
`SAVE\CHRDATA{n}.{GAM,JNK,WIZ,EFF}` (see `docs/engine/research/
dok-chrdata-save-format.md` for the full byte-evidence writeup). `G`/`V`/`E`
now mirror the TypeScript DoK save-sidecar loader; `W` remains a raw-evidence
printer for the partially modeled spell record. Letters: `G`am, in`V`entory
(`J`/`K` were already taken), `W`iz, `E`ff.

- **`G`** (216 bytes, RESOLVED core): a DoK `.GAM` record shares a compact
  storage shape and several field anchors with the DoK monster record
  `monster.ts`'s `DOK_LAYOUT` decodes (verb `M` on a 216-byte DAX block), but
  PC fields need their own evidence: its u32 `+0x62/+0x64` is XP, established
  by the title's `0x41` handler. `print_dok_char` reuses `print_monster`'s
  field-printing body directly (`jmp print_monster.body`) rather than
  duplicating it. Verified against all 6 real `CHRDATA{1..6}.GAM` records: the
  decoded names match the known pregen party (SIR DRYDEN/LILLITH/TANAR/
  FLAVIUS/NEACAIL/CELESTE) and thac0/ac/damage all decode to sane D&D values.
  The `category` byte (offset 32) reads as a class-code-like enum for a PC
  record (values 0/1/2/5/6 observed) rather than the monster 5/6/7 enum — the
  printed label still says `category:` (inherited from the shared body) but
  means "class code" in this context.
- **`V`** (63-byte records, name+count+identity RESOLVED): a `.JNK` file is the
  character's **inventory**, not literal junk — COAB's `SavePlayer` writes an
  `.swg` sidecar with one `Item.StructSize` block per carried item, and this
  is DoK's version of that file. Name@0/1 and count@57 are VERIFIED (a stack
  like "127 Arrows +1" decodes to `count: 127`, exactly `item.ts`'s CoK
  `COUNT_OFFSET`). The byte@42 slot (where the CoK `I` verb reads a
  `baseTypeId`) is printed too but is **not** a real field here: across real
  records it climbs by exactly 63 (the record's own size) from one record to
  the next — the low byte of a stale pointer to the record's own address, not
  game data. Printed as `scratch42(notAField):` so the output stays honest.
  The real item identity field is byte `0x2e`, matching the
  `monsterSideTables.ts` carried-item layout used for `MON{n}ITM.DAX`.
- **`W`** (220 bytes, PARTIAL, sharpened 2026-07-02): the spell-memorization
  record. All-zero for non-casters; for casters, offsets 34..73 hold a
  right-justified, zero-padded, sorted **list of currently-memorized
  spell-slot instances** — CONFIRMED (not just inferred) via a real
  before/after level-up diff on the same character, which shows the list
  growing by a multiset union of new entries at level-up. The exact spell-id
  encoding and the boolean-flag region past offset 73 are still open. Rather
  than assert an unconfirmed model, this verb prints raw evidence: an
  `isCaster` flag, each nonzero byte in the fixed 34..73 window (offset +
  value), and every nonzero byte in the wider 180..219 tail window (offset +
  value) — widened from an earlier two-hardcoded-4-byte-slot print after a
  larger sample survey showed real data occupies more of that range than the
  original 188-191/212-215 guess. That tail window was checked against and
  does **not** match the engine's own `spellSlots()` PHB table; part of it
  (212-219 for one character subgroup) is byte-identical across distinct
  characters, suggesting class-static data rather than personal state.
- **`E`** (9-byte records, RESOLVED structure): a `.EFF` file is the
  character's **active affects**, and is absent from disk entirely when a
  character has none (COAB's `.fx` sidecar: "only if affects > 0"). The
  9-byte record is the SAME layout `S` already decodes for `MON*SPC.DAX`
  (`type@0`, `minutes` u16@1, `affectData@3`, `callAffectTable@4`, 4 scratch
  bytes) — `print_eff` reuses `print_mon_spc`'s loop via `jmp
  print_mon_spc.body`, skipping only the DAX-only `blockId` line. Confirmed
  on 3 real `.EFF` files: `minutes` is always 0 and `affectData` is always
  `0xff` (permanent, item-granted effects with no timer) in every sample.

All four were run headlessly under real DOSBox (`Death Knights of
Krynn\DOSBOX\DOSBox.exe`, autoexec + stdout redirection) against copies of
the real shipped `SAVE\CHRDATA{1,4}.GAM`, a real `CHRDATA1.JNK` (14 items),
`CHRDATA{1,4}.WIZ` (one non-caster, one caster), and two real `.EFF` files —
output matched the independent Python byte analysis in the research doc
exactly, field for field. The 2026-07-02 `W`-tail widening was re-verified
the same way against `CHRDATA1.WIZ`, `CHRDATA4.WIZ` and a new
`cloud_saves\SAVE\CHRDATA5.WIZ` sample (NEDEIL) — see the research doc §9.

### CCECL (`src/ccecl.asm`)

Clean-room ECL bytecode interpreter/tracer. Speaks **both** Krynn ECL dialects,
auto-detected from the input file's first bytes (`sniff_dialect`):

- `CCECL <block.bin> [/T] [/E [out]]` — **Gen1** (CoK/DoK): a raw decompressed ECL block
  read straight from a `.DAX` archive block (22-byte header, vaddr entry
  0x8014, vbase 0x7FFE).
- `CCECL <file.dax> <blockId> [/T] [/E [out]]` — **Gen1 DAX archive**:
  locate raw DAX block id `<blockId>`, signed-byte-RLE decompress it, then run
  the same Gen1 VM path.
- `CCECL <file.glb> <areaId> [/T] [/E [out]]` — **Gen2** (DQK): a whole `ECL.GLB` HLIB
  `DATA` container. Walks the container's flat member table, resolves
  `<areaId>` through member[0]'s id table (`packages/engine/src/loaders/
  eclGlb.ts`), and interprets the matching member under the Gen2 header
  dialect (20-byte header, no magic, vbase 0x8000 — `ECL_GEN2` in
  `packages/engine/src/ecl/disassemble.ts`).

Both dialects share the same opcode core, dispatch table, and operand framing
(`vm_run`/`exec_one` are shared); the header length and vbase
([hdrlen]/[vbaseval]) differ per dialect, and `op_call` treats Gen2 low raw
words `0x0001`/`0x0002` as direct routine ids. Any opcode byte above the documented
`0x00-0x40` range halts the VM without emitting a trace line before a map bridge
exists, mirroring the TS oracle's `decodeInstructionAt` "badOpcode" path —
Gen2's extended opcode set past 0x40 is an open research item, see
`docs/engine/research/decompile-dqk-ecl-dispatch.md`. With `/E`, a bad opcode
after `LOAD_FILES` is treated as a completed native-preview handoff because real
entry scripts can fall through or branch into packed data after the host has
already received the map effect. `/T` emits a deterministic
`PC=NNNN OP=XX[ MEM[AAAA]=VVVV]` trace to `CCECL.TRC`; verified against an
instrumented `EclVm.step()` oracle with **0 mismatches** (Gen1: CoK ECL1 block
34; Gen2: real DQK `ECL.GLB` areas 34/2/4, including one run that correctly
halts on an undocumented extended opcode before the bridge-complete policy applies).
The native core now covers the deterministic TS VM opcodes needed for real
startup traversal: GOTO/GOSUB/RETURN, COMPARE/COMPARE_AND/IF_*, SAVE,
ADD/SUBTRACT/DIVIDE/MULTIPLY, RANDOM, PARTYSTRENGTH with the default host
metric 0 or a `/Z` seed, headless `INPUT_STRING`/WHO responses and interactive
menus, Gen2/DoK `SHORT_MENU`, PARLAY/WHO/INPUT_NUMBER/INPUT_STRING continuations, NEWECL,
LOAD_FILES, COMBAT-as-yield, ON_GOTO/ON_GOSUB, AND/OR with compare-flag
updates, PARTY_SURPRISE with the conservative no-ranger default or seeded ranger
signal,
SURPRISE pre-combat result writes, GETTABLE/SAVE_TABLE sparse-memory table access,
LOAD_MONSTER/CLEAR_MONSTERS
encounter queuing, ADD_NPC join capture, FIND_ITEM/FIND_SPECIAL boolean queries
with conservative not-found defaults plus decimal host seeds for the first native
party/inventory/spell checks, and
LOAD_PIECES. The `.COM` explicitly
clears its un-emitted VM state once per process run because DOS does not
guarantee scratch memory starts zeroed after a previous child process. When a
DAX or Gen2 HLIB input yields `NEWECL`, CCECL now resolves the next block from
the same container in-process, with a bounded follow depth, preserving the
shared ECL memory table, RNG state, and queued native effects across the chain.
Raw `.BIN` inputs still report status `chain` because there is no container to
resolve the next block from.

Before a full DOS save/roster loader exists, `CCECL` can still run non-empty
party-query paths from decimal command-line seeds:

```
CCECL <ecl> [/G seed.gbps] [/B party.gbpr] [/I item]... [/A affect]... [/U member affect]... [/M move]... [/K thief]... [/S spell]... [/V member spell]... [/N partyCount] [/H hasRanger] [/Z partyStrength] [/L inputValue] [/C menuChoice] [/Y parlayChoice] [/O encounterAction] [/W whoChoice] [/D encounterDistance]
```

Repeatable `/I` drives `FIND_ITEM` and matching `DESTROY_ITEMS` clears only
that seeded item type; repeatable `/A` drives the `CHECKPARTY` party-affect
query and remains the `FIND_SPECIAL` fallback; repeatable `/U member affect`
adds a one-based member-scoped affect that `LOAD_CHARACTER` selects before
`FIND_SPECIAL`; repeatable `/M` drives the
`CHECKPARTY` movement min/max/average query across supplied movement values;
repeatable `/K` drives the eight `CHECKPARTY` thief-skill min/max/average
queries across supplied skill values in legacy/manual mode;
repeatable `/S` exposes one synthetic member-0 spell list for `SPELL`;
repeatable `/V member spell` adds one-based member-scoped spell slots for
`SPELL`; `/N`
lets `LOAD_CHARACTER` accept one-based in-range member ids and lets absent
`SPELL` queries report the last scanned synthetic member; `/H` makes
`PARTY_SURPRISE` see a ranger present; `/Z` supplies the `PARTYSTRENGTH`
host metric, defaulting to 0 in direct `CCECL` runs when omitted; `/L` seeds the headless
`INPUT_NUMBER`/`INPUT_STRING` response value; `/C` seeds the zero-based headless
`VERTICAL_MENU`/`HORIZONTAL_MENU` response; `/Y` seeds the zero-based headless
`PARLAY` attitude response. With `/!`, a complete Gen1 PARLAY instead yields
the five standard attitudes through CCMENU and maps the selected index through
its title-owned response values on cold resume. With `/!` and a validated GBPR
roster, `WHO` yields bounded imported member-name labels through CCMENU and
cold-resumes the selected zero-based member; `/W` remains its headless seed.
`/O` seeds the zero-based headless
`ENCOUNTER_MENU` action slot (`0=COMBAT`, `1=WAIT`, `2=FLEE`, `3=ADVANCE`,
`4=PARLAY`); `/W` seeds the zero-based headless
`WHO` response and preserves it in `GBSX`. `/D` supplies the host encounter
distance seed that `SETUP_MONSTER` clamps and `APPROACH` decrements.
`/@ vaddr` is a direct-entry probe for tests and research; it starts at a
specific ECL virtual address after normal host seeding, so unreachable or
not-yet-wired tactical subroutines can be validated without claiming a natural
walk-loop route.
`/G seed.gbps` loads party-query seed values from `GBPS`. Version 1 is the
legacy 150-byte sidecar: flags for valid party count/ranger/distance scalars,
then bounded arrays for items, party affects, four member-affect pairs,
movement values, flat manual thief-skill values, spells, and four member-spell
pairs. Version 2 appends a bounded eight-member by eight-skill thief matrix,
letting `CHECKPARTY` queries `0x00A5..0x00AC` summarize the matching skill
column instead of reusing one flat `/K` list. Version 3 appends up to sixteen
sparse memory key/value rows; CCECL applies them through the same bounded path
as repeatable `/X <addr> <value>`, but without consuming the DOS command tail.
GBBOOT uses that v3 tail for DQK area-5 slot-3 dispatcher registers while the
natural host-state path is still being pinned. `GBBOOT /E` also accepts
repeatable `/0 <addr> <value>` sparse memory seed pairs and writes them through
the same GBPS v3 tail for bounded headless probes; those seeds are global to
the invoked CCECL setup and should be treated as debug host-state inputs, not
as decoded retail save state. Explicit decimal switches remain supported for
direct debugging. `/B party.gbpr` validates GBPR v1 and imports
the verified roster count plus the same CoK thief matrix and DoK GBD1 movement
fields that GBBoot refreshes into GBPS. GBPR is loaded before GBPS, so a compact
seed sidecar can still override roster-derived values for manual/debug runs.
Missing seeds keep the prior deterministic
empty-roster behavior. `GBBOOT /E`
can forward manual decimal seeds with conflict-free aliases: repeatable
`/I item`, repeatable `/F affect`, repeatable `/U member affect`, repeatable
`/M move`, repeatable `/K thief`, repeatable `/S spell`, repeatable
`/V member spell`, `/P partyCount`,
`/H hasRanger`, `/Z partyStrength`, `/L inputValue`, `/C menuChoice`, `/Y parlayChoice`, `/O encounterAction`, `/W whoChoice`, and `/Q encounterDistance`;
`/F` maps to CCECL `/A`, `/U` maps to CCECL `/U`, `/P` maps to CCECL `/N`, `/Z` maps to CCECL `/Z`, `/L` maps to CCECL `/L`, `/C` maps to CCECL `/C`, `/Y` maps to CCECL `/Y`, `/O` maps to CCECL `/O`, `/W` maps to CCECL `/W`, and `/Q` maps to CCECL `/D`
because `GBBOOT` already uses `/A` for area override and `/N`/`/D` for dry-run. If `/P` is
not supplied, `GBBOOT /E` derives the CCECL `/N` party-count seed from existing
save slots (`SAVE\CHRDATA1..6.SAV` for CoK and `SAVE\CHRDATA1..6.GAM` for
DoK, falling back to `cloud_saves\SAVE` and, for DoK, the real
`CHRDATA*`/`CHRDATB*`/`CHRDATC*` cloud slot families with up to eight
characters). For DQK it first
reads the `partySize` byte 31 from `SAVGAM[A-J].QSV` and exact `SAVGAME.QSV`
files in `SAVE\`, the local GOG-root `cloud_saves\SAVE` layout, or the game
root, then falls back to counting `SAVE\CHRDATA1..8.QCH` and GOG-root
`cloud_saves\SAVE\CHRDATA*`/`CHRDATB*`/`CHRDATC*` QCH slots with up to eight
characters. This lets `LOAD_CHARACTER` accept
in-range party-member ids before a full native roster loader exists. For DQK,
`GBBOOT /E` also derives a conservative `PARTYSTRENGTH` seed from that detected
party count (`count * 40`) unless `/Z` is supplied explicitly, so real Gen2
strength gates no longer see the VM's fallback metric 0 during normal native
boots. If `/K` is
not supplied for CoK, `GBBOOT /E` also derives the v2 thief-skill matrix from
bytes **219..226** in each valid 409-byte `SAVE\CHRDATA1..6.SAV` record, with
`cloud_saves\SAVE` fallback. DoK `.GAM` raw thief-skill offsets are still not
verified, but compact DoK GBPR records with a `GBD1` tail now refresh a GBPS v2
matrix row for inferred thieves from the derived class/level metadata. This
includes native-created DoK thieves and gives CCECL's selected-player
`0x7CA5..0x7CAC` pseudo fields real per-member data without a manual `/K` list.

> **THE CoK THIEF-SKILL OFFSET WAS WRONG FROM THE START, AND THE TESTS COULD NOT HAVE
> SAID SO (corrected 2026-09-07).** Both paragraphs above read `139..146` until this date.
> **139 is FRUA's Pick Pocket offset** -- `hackdocs_extracted/CCHFORM.TXT` 139..146, a
> document whose own opening lines say it describes FRUA `.cch` -- and it had been applied
> to a game that is not FRUA. Measured over all six retail
> `Champions of Krynn\SAVE\CHRDATA{1..6}.SAV` records (409 bytes each): bytes 139..146 are
> **zero in 6 of 6**, while 219..226 are zero in 5 of 6 and carry `34 3D 2F 28 22 16 62 00` (hex; decimal 52 61 47 40 34 22 98 0 -- thief-skill percentages)
> for MOLLY, who is the party's only thief (class byte 91 = 14 = Fighter/Thief, race byte
> 90 = 5 = Kender, both read off CoK's own `START.EXE` menu enums). Verified end-to-end
> against **our own artifact** and not only the retail file: `native/build/ROSTER.GBP`, a
> CoK GBPR this engine wrote, carries the same eight bytes at body offset 219 and zeros at
> 139 -- so GBPR embeds the retail body verbatim.
>
> **The old code could not have worked even with the right offset.**
> `collect_save_thief_matrix_at` read only **147** bytes of the file, so 219 was outside the
> buffer entirely. It copied eight zeros per character and still incremented
> `seed_thief_matrix_count` -- reporting the matrix POPULATED and uniformly zero, which is
> indistinguishable from a party with no thief. **And 147 is not an arbitrary length: it is
> CCHFORM.TXT's OWN next offset** (147 = "Set to zero (reserved for 128 + Morale)"), so the
> read length was transcribed from the FRUA document along with the offset. The routine was
> a faithful implementation of the wrong spec, which is why it looked right. Constants are now `COK_CCH_THIEF_OFF equ
> 219` and `COK_CCH_THIEF_READ equ COK_CCH_THIEF_OFF + PARTY_THIEF_SKILL_COUNT` in
> `native/src/gbboot.asm`, plus `PS_COK_THIEF_OFF equ 219` in `native/src/ccecl.asm`.
>
> **Why the three green tests never caught it, which is the part worth keeping.** All three
> pins built SYNTHETIC buffers that placed the skill bytes at 139 *because the code read
> 139* -- the `$autoSav1` / `$autoSav2` writers in `gbboot-test.ps1` and
> `Write-CokGbpr` in `ccecl-effects-test.ps1`. (Named by SYMBOL deliberately: this
> paragraph first cited them as `:917`, `:927` and `:186`, which the very edit that
> fixed them moved to `:926`, `:936` and `:191`. A line number cited in a note about
> misfiled citations rots exactly as fast as any other.) They are
> goldens produced to match the code under test, so they could confirm the reader was
> self-consistent and nothing more. **No assertion in this repo compared either offset
> against a retail record.** The fixtures now write at 219 and say why in a comment.
>
> **Proof the fix can fail, as a three-cell table rather than one green run.** Engine 219 /
> fixture 139 -> RED (`XCAFFAUTO GBPS thiefMatrix[0] expected 10, got 0`); engine 219 /
> fixture 219 -> GREEN (`gbboot-test.ps1` 343 PASS, `ccecl-effects-test.ps1` three RESULT
> PASS); engine reverted to 139 / fixture 219 -> RED in both, `gbboot-test.ps1` on the same
> needle and `ccecl-effects-test.ps1` on `trace missing 'OP=09 MEM[0310]=00C1'`, which is
> the thief assertion itself -- the ECL program at `ccecl-effects-test.ps1:643-655` stamps
> `0xC1` only when the party minimum of skill 0 is 10. The revert was done by re-editing the
> constant and undone the same way, with SHA-256 compared against the pre-mutation bytes;
> **never `git checkout`**, which destroyed a round's work here on 2026-09-05.
>
> **NULL, stated because it is the weak half: only 1 of the 6 retail records discriminates.**
> A non-thief is zero at both offsets, so five records are uninformative, and both the
> location of 219 and the refutation of 139 rest on MOLLY alone. Nothing was checked outside
> these six shipped pregens.
>
> **The GBBOOT roster site is GATED on `game_cok`; the CCECL site is not, and the difference
> is measured.** `sync_cok_roster_count`'s `.record_cok` is reached by ELEVEN boot profiles,
> and the retail record is not one layout across them -- Champions of Krynn is **409** bytes,
> Curse of the Azure Bonds **422** and Pool of Radiance **285**, measured from each title's
> own shipped CHRDATA saves. So no single constant can serve all eleven: CoK gets 219 and the
> other ten keep 139. That is **not** an endorsement of 139 for them -- none of them is FRUA
> either -- it is a refusal to extend a one-title measurement to ten unmeasured titles.
> Whoever measures them owes that site a per-profile offset, not a second special case.
> CCECL is ungated because it cannot tell: it sees only the GBPR header's DoK flag, so its
> non-DoK branch has no per-title discriminator. The argument there is structural --
> `GBPR_ENTRY_SIZE equ 410` = 1 + 409 is exactly CoK's record length, so a non-DoK Gen1 GBPR
> body is a CoK-layout record by the format's own definition, and Curse's 422 does not fit.
> It is also a FALLBACK: `start:` calls `read_roster_file` before `read_seed_file`, and the
> GBPS v2 seed overwrites `party_thief_matrix_count`, so a seeded run never depends on it.
If `/I` is not supplied, `GBBOOT /E` also
derives up to four unique CCECL `/I` carried-item seeds from byte `0x2e` in the
63-byte records found in CoK `SAVE\CHRDATA1..6.STF` sidecars or DoK
`SAVE\CHRDATA1..6.JNK` inventory sidecars, with `cloud_saves\SAVE` as a
fallback and DoK `CHRDATB*`/`CHRDATC*` slots included when the A slot is absent. If
`/M` is not supplied, it derives ordered CCECL movement seeds from those same
CoK `.STF` or DoK `.JNK` sidecars: an opened character sidecar contributes the
native combat-cell default 4, lowered to 3 for readied Ring Mail or 2 for
readied Plate Mail, with the same `cloud_saves\SAVE` and DoK B/C-slot
fallbacks as item seeding. If
`/F` is not supplied, it derives up to eight unique CCECL `/A` affect seeds
from nonzero type bytes in the 9-byte records found in CoK
`SAVE\CHRDATA1..6.SFX` sidecars or DoK `SAVE\CHRDATA1..6.EFF` sidecars, and
also derives up to four CCECL `/U member affect` seeds from those same records
using the save slot as the one-based member id, with `cloud_saves\SAVE` as a
fallback and DoK `CHRDATB*`/`CHRDATC*` slots included when the A slot is absent. If
`/S` is not supplied for DoK, it also
derives up to four unique CCECL `/S` spell seeds from the nonzero bytes in each
fixed 220-byte `SAVE\CHRDATA1..6.WIZ` record's verified 34..73
memorized-spell window, plus up to four CCECL `/V member spell` pairs from the
same records using the save slot as the one-based member id, with `cloud_saves\SAVE`
as a fallback and DoK `CHRDATB*`/`CHRDATC*` slots included when the A slot is
absent. When any manual or
automatic roster/sidecar seed exists, `GBBOOT` writes `<tools-dir>\_GBSEED.BIN`
and passes `CCECL /G <tools-dir>\_GBSEED.BIN`; for CoK and DoK it also passes
`CCECL /B <tools-dir>\_GBPARTY.GBP`. Direct scalar seeds such as
`/Z`, `/L`, `/C`, `/Y`, `/O`, and `/W` stay as command-tail arguments. This
keeps the DOS command tail within the 127-byte PSP limit even when inventory,
affect, spell, member-affect, and member-spell seeds are present.
This is still a bounded bridge for early native ECL boot paths; automatic
per-member stat/item loading and full spell-list loading are the next larger
subsystem.

`/E` emits a versioned `GBEF` effect record (`CCECL.EFX` by default, or
`[out]`). Version 9 preserves the original v2/v3/v4/v5/v6/v7/v8 prefix: latest `LOAD_FILES`
operands, GEO block id, raw `LOAD_PIECES` operands, resolved WALLDEF set ids
using the same two-set dispatch as `packages/engine/src/ecl/vm.ts`, and the
final unresolved NEWECL chain id, if execution stopped on a raw-input chain. It
appends a compact encounter handoff: up to eight queued `LOAD_MONSTER` groups
(`monsterId`, count, CPIC block) and up to eight `ADD_NPC` joins (`npcId`,
morale). The v3+ continuation tail appends resumable VM state for COMBAT yields: current
block id, post-COMBAT pc, RNG, call stack, and sparse memory. `/R <state.gbef>
<outcome-or-file>` restores that state, applies the combat outcome to the
compare flags, and continues execution so ordinary `IF_EQ`/`IF_LT`/`IF_GT`
post-combat branches work under DOS. Explicit `CCECL /!` menu mode instead
emits a 5,920-byte v14 record for Gen1 menus and a 5,932-byte v15 record for
Gen2 menus. The latter also retains the six raw comparison flags in `GBRF`.
Both append `GBMN` and `GBMS` with a
pending menu's identity and transient VM state, plus a fixed 128-byte `GBMT` tail that
holds raw packed prompts/option labels and, for WHO, bounded ASCII GBPR member
names; INPUT_NUMBER and INPUT_STRING have no text segments and render the
validated free 16-bit numeric prompt or text-length bound. Neither writes a selection before
the answer. Its `/R` path accepts only an exact 18-byte `GBMO` v2 answer with
the matching count, in-range selection, and PC/area/destination/opcode
identity, then restores the checkpoint, including comparison flags,
selected-character context, and queued encounter/NPC/setup state, before
writing that selection at the post-menu PC. For `INPUT_STRING`, CCMENU instead
uppercases bounded keyboard text, commits its character words and NUL terminator
to the pending sparse checkpoint, and returns selected zero; CCECL validates
the same identity and resumes without overwriting that string. Normal `/C` routes remain v9 deterministic automation; with
explicit `/!`, GBBOOT also supplies it to CCMENU as the headless `/S` choice.
CCMENU validates the exact v14/v15 payload, decodes the prompt and numbered option
labels (renders the WHO roster's ASCII labels, or prints an INPUT_NUMBER
`0..65535` prompt), and rejects a malformed,
truncated, trailing, or incomplete menu record.
The menu smoke exercises vertical and horizontal synthetic menu records, and
GBBOOT drives two consecutive vertical yields through CCMENU and cold CCECL
resume for both CoK and DoK-configured fixtures. `GBBOOT /E` consumes the stable prefix for
map baking and consumes the status/encounter appendix to dispatch `CCCOMBAT`
when `CCECL` yields combat. `CCEFX` prints `GBLF`/`GBLP` rows for the emitted
`LOAD_FILES` fields, raw `LOAD_PIECES` operands, and resolved wall-set ids.
The legacy `GBLF operands=` label prints three serialized words: for DQK,
only the first two are raw operands; the third is persistent CA03 state
tagged `D0xx`. A zero second operand stores `D000`, while `FF` preserves the
prior word (including the untagged zero at reset). Gen1 retains its raw third
operand. See [the source contract](../docs/engine/research/dqk-combat-context-ca03.md).
It also prints a compact `GBRS` line with flags, area, saved pc, RNG,
call-stack depth, and sparse-memory count, followed by the saved return PCs and
the first sixteen sparse-memory key/value pairs. The
v6-format `GBSX` tail preserves up to sixty-four
host-facing script side effects as `{opcode, argc, operands[8]}` records. For a
script that reaches the recordable 65th effect, `CCFLOW` retains every ordered
`{event[20], text[34]}` pair in a versioned sibling `GBSL` v1 file and marks
the final terminal effect with `FX_HAVE_SIDECAR=0x0100`. It replays only the
validated script-capacity state; it never invents combat flags or an outcome. It
captures visual/text events (`PICTURE`, `PRINT`, `PRINTCLEAR`, `SPRITE_OFF`,
`PRINT_RETURN`, `DELAY`, `CLEAR_BOX`), deterministic headless input/menu/
selection captures (`INPUT_NUMBER`, `INPUT_STRING`, `VERTICAL_MENU`,
`ENCOUNTER_MENU`, `HORIZONTAL_MENU`, `SHORT_MENU`, `PARLAY`, `WHO`), deterministic
host-state predicate captures (`PARTYSTRENGTH`, `PARTY_SURPRISE`,
`SURPRISE`), plus known engine/state opcodes whose mutation is still preserved
for the native bridge (`TREASURE`, `ROB`, `CALL`, `DAMAGE`, `ECL_CLOCK`,
`PROGRAM`) and the documented unknown opcode (`UNKNOWN_1F`).
That unknown opcode is still skipped with no game-state semantics and preserved
so native boot transcripts do not lose evidence when a script reaches it.
`CALL` routine ids are consumed as deterministic native headless no-ops but are
kept in `GBSX` as `{rawOperand, routineId}` so boot transcripts show the
external routine dispatch without losing reference-form operands. Gen1 uses the
COAB `operand - 0x7FFF` id formula, while Gen2 low raw words `0x0001`/`0x0002`
are treated as direct duel-setup ids.
`ECL_CLOCK` is kept in `GBSX` as `{timeStep, timeSlot}` and now also advances
the persisted seven-slot mixed-radix DOS clock in the append-only v9 `GBCL`
tail; `/R` restores that clock before continuing post-combat scripts. `DAMAGE`
is decoded by the TS VM into typed dice/targeting host events; on the DOS side,
`GBBOOT` now applies the unambiguous automatic party-wide policy
(`control & 0xE0 == 0xE0`) and selected-member/no-save policy with exported
`LOAD_CHARACTER` context to native `GBPR` current HP after noncombat CCECL
routes, while still preserving the original event in `GBSX`. Saving-throw,
random-target, attack-roll, and selected-member policies without valid exported
selection context remain preserved-only until broader native save/targeting/death
handling exists.
Opcodes with
more than eight operands keep the true `argc` and the first eight rvalues in the
fixed record. For each captured event, the `GBSX` tail also
stores the first inline packed ECL string decoded to up to 32 ASCII characters,
so simple `PRINT`/`PRINTCLEAR` text survives the native bridge. String-table or
runtime memory string references remain numeric operands except for the native
`COMPARE memstr,inline-string` equality path; `0x81` otherwise preserves the
full decoded pointer word. For supported Gen1 DAX `PRINT`/`PRINTCLEAR` with
more than 32 decoded characters, a CCFLOW-marked CCECL child places a bounded
DREF in the same slot. Direct CCECL keeps the historical 32-character inline
prefix. CCFLOW resolves the DREF to an exact GBSL v2 packed payload,
and CCFP `/W` pages by event ordinal and decoded offset. The isolated DoK
ECL1 block-16 first literal has 159 packed bytes and 212 decoded characters,
displayed as 117+95 characters with focusless GameLink Enter evidence.
`/Z` skips tagged long text, v14 menu yields keep the historical inline
prefix, and saturated tagged v14 yields reject. See
`docs/engine/research/dok-first-printclear-native-transport.md` for the
format, tests, and first-literal boundary.

For Secret Amiga PRINT/PRINTCLEAR, the CCFLOW child now records a DREF after
33 nonzero characters and resolves the exact method-zero GLIB operand into
GBSL2/GBPX extension2. This codec skips zero symbols and clamps decoded text
at255, matching the complete original DOS decoder. CCFP validates the whole
extension before row0, pages with a word cursor and appends source-owned spaces
exactly, including inline rows preceding a long reference. Direct CCECL keeps
its32-character preview. Extension1/DAX and no-reference GBSL1 retain their
established decoding and spacing; old durable streams keep their own codec.
Finite display at255 and of wide unbroken words deliberately fixes original
renderer looping/clipping. CCEFX's codec2 support is diagnostic only; CCHOST
still rejects it for mutation. See
`docs/engine/research/secret-print-contract.md` for source proof, compatibility
and the completed runtime validation and verified release3e1158cd.

For GameLink verification across graphics/text mode changes, build a separate
candidate using `tools/build_dosbox_gamelink.py`; see
[`dosbox-gamelink-build.md`](../tools/dosbox-gamelink-build.md). Pass the resulting
manifest's `candidateExe` explicitly to `run-goldbox.ps1 -DosBoxPath` or the
hidden smoke helper's `-Dosbox`. The recipe preserves installed emulators and
does not change the retail default. Its minimal patch retains injected input
history across video reinitialization so a released key/button reaches the
guest. The native last-page caption copy independently saves/restores ES;
console input behavior and menu parsing remain unchanged.

Applying inventory, broader HP/save/death
handling, timer, and external-routine mutation is still a later
subsystem. `INPUT_STRING` writes 0 in native headless mode unless seeded with
`CCECL /L`; under `/!`, it accepts bounded keyboard text, uppercases it, and
cold-resumes the sparse `memstr` bytes. The common `memstr == inline-string`
comparison form has native equality semantics. `INPUT_NUMBER` writes through
operand 2; its first operand is unused by the DQK retail handler. `/L` seeds
headless numeric input, while `/!` yields a free unsigned 16-bit decimal
response without converting its range into menu options. Under `/!`, Gen2 and the title-specific
DoK, Pools of Darkness, Buck Countdown, and Matrix Cubed `SHORT_MENU` frames yield
through CCMENU; other Gen1 `0x31` profiles remain recorded-only pending title-specific
frame coverage. `VERTICAL_MENU`/`HORIZONTAL_MENU` write 0 unless seeded with
`CCECL /C`, `PARLAY` chooses HAUGHTY unless seeded with `CCECL /Y`; with `/!`
its Gen1 five-attitude form yields CCMENU and cold-resumes the corresponding
title-owned response value. Under `/!` with a valid GBPR roster, `WHO` yields
the member names through CCMENU and cold-resumes its zero-based selection;
otherwise it writes 0 unless seeded with `CCECL /W`,
`ENCOUNTER_MENU` chooses COMBAT unless seeded with a clamped action slot via
`CCECL /O`, but
their destination/range/count/action/option operands are now preserved in `GBSX`
for a later interactive host. `PARTYSTRENGTH` and `SURPRISE` preserve their
deterministic host-state inputs/results in `GBSX`; `PARTYSTRENGTH` uses metric 0
unless seeded with `CCECL /Z`. DQK `PARTY_SURPRISE` preserves retail `LE`/`GE`
comparison flags and, under `/!`, yields its prompt and Yes/No choices through
the v14 menu bridge before taking the corresponding `IF_EQ`/`IF_NE` branch;
headless runs retain deterministic `/C` behavior.
ECL operand type `0x81` is decoded as a typed memory-string pointer, matching
EclDump's three-byte operand framing. That lets native DoK block 51's
trap-found path preserve `FINDS A TRAP.` and its following `PARTYSTRENGTH`
event instead of stopping in the middle of the print sequence. The same probe
confirms that this arm/state path still exits at the packed-data byte after
`PARTYSTRENGTH`; it does not itself queue tactical combat. The queued block-51
combat proof remains the separate vmRun1 path gated by `4CE9` and `4CE8`.
`PROGRAM` host dispatches are preserved in `GBSX` as the resolved
program id while remaining flow-preserving in native headless mode. `PROGRAM #0`
is a host StartGameMenu dispatch in the TS engine. `PROTECTION` remains a
clean-room flow-preserving no-op because CoK's copy-protection check lives in
GAME.OVR rather than ECL opcode `0x3C`. `DUMP` is also consumed as the
retail/debug no-op. Verified DQK entries 1, 2, 3, 7, 10, 14, 18, 34, 38, 42,
54, 62, and 66
currently emit usable map effects with a normal VM exit. Entries 4, 5, 22, 26,
30, 46, and 50 emit usable map effects and now finish as native bridge-complete
exits when the next byte is packed data rather than a decoded opcode. The verified native handoffs
now cover GEO ids 2, 4, 10, 14, 18, 22, 26, 30, 34, 38, 42, 47, 50, 54, 62,
and 66; entry 14 also
preserves sixteen PICTURE script effects in the native dump. Repeated stable
`LOAD_FILES`/`LOAD_PIECES` loops stop after the bounded script-effect window
instead of spinning to the global step guard.
The v8 `GBHD` diagnostics still pin true native VM halts with the active ECL
area/block, halt PC, and opcode byte; post-`LOAD_FILES` DQK data fallthroughs
and post-`GBSX` SearchLocation packed-data fallthroughs leave `GBHD` reason zero
and report `status=0000` in the dump.
Version 9 keeps the v7 `GBES` setup tail for `SETUP_MONSTER`: sprite id,
max-distance, picture id, and the current approach distance. Native headless
execution records the script setup operands and uses CCECL `/D` as the
renderer/host-owned distance seed, defaulting to zero. `APPROACH` decrements a
nonzero tracked distance when one is present. `CCECL /J <cellWord>` enters the
SearchLocation far pointer and seeds the dialect's host cell descriptor; Gen2
DQK preserves the full word instead of truncating to a byte. `CCECL /Q
<cellWord>` enters the vmRun1 far pointer for Gen1/DQK per-step scripts, and
`CCECL /2 <cellWord>` enters far-pointer slot 2 (`PreCampCheck`) for event
probes, and `CCECL /3 <cellWord>` enters far-pointer slot 3
(`CampInterrupted`) for real event-route probes such as DQK area 5's encounter dispatcher. `CCECL /F
<facing>` seeds DQK's raw facing ordinal (`0=N,1=E,2=S,3=W`) at memory
`0x0011`, and repeatable `CCECL /X <addr> <value>` seeds bounded sparse memory
for runtime-owned variables and tables during native probes. `GETTABLE` first
honors sparse memory overrides, then reads the original byte from inline ECL
table data when the table cell has not been mutated. It also keeps `GBHD`, a halt diagnostic
tail that records why `status=0004` happened: bad opcode, step budget, sparse
memory full, or unresolved chain follow, plus the active ECL area/block, halt
PC, and opcode byte when available, including script, encounter, and call-stack
capacity halts, and appends `GBCL`, the seven persisted
clock slots mutated by `ECL_CLOCK`.
`GBBOOT /1` invokes that vmRun1 `/Q` path as a bounded research hook, while
`GBBOOT /Q` forwards the encounter-distance seed through the native boot chain; `CCFP /E`
consumes the `GBES` tail and draws a simple distance-scaled approach marker
unless a matching CPIC icon GBIM was supplied (CoK/DoK, see the first-person encounter
art paragraph in the GBIM section). `CCFP /E` also consumes the v9
`GBCL` clock tail as a bottom-band fallback when the effect record has no
inline `GBSX` text, and as the native sky-backdrop clock source for
`Draw3dWorldBackground`'s pinned body placement.

### CCEFX (`src/ccefx.asm`)

Read-only DOS dump helper for `CCECL /E` bridge files:

```
CCEFX <effect.gbef> [out.txt]
```

It validates the `GBEF` header, prints the stable bridge fields, prints
`GBLF`/`GBLP` rows for map and wall-piece bridge operands, dumps queued
`LOAD_MONSTER` groups and `ADD_NPC` joins, dumps each `GBSX` script-effect event
as opcode, mnemonic, argc, operands, and decoded inline text when that slot is
present. When `FX_HAVE_SIDECAR=0x0100` is set, it derives the exact sibling
`.GBS` name, validates GBSL v1 magic/version/count and exact file length, then
streams every record in source order; a missing or malformed sibling rejects, prints typed summaries for preserved `TREASURE`, `ROB`, `CALL`,
`ECL_CLOCK`, `PROGRAM`, and `DAMAGE` host events plus deterministic
`PARTYSTRENGTH`, `PARTY_SURPRISE`, and `SURPRISE` predicate captures, prints the
v7 `GBES` setup tail when present, prints the v8 `GBHD` halt diagnostic when present, and
prints the v9 `GBCL` clock slots when present. This is meant as a DOS-side inspection surface for the native engine
handoff; it does not mutate saves, party state, or the effect record. With
`[out.txt]`, the transcript is written directly by
`CCEFX`, which lets `GBBOOT` invoke it via DOS `EXEC` without shell redirection.

## cc tool: CCGB (`src/cgb.asm`)

DOS `.DAX` graphics viewer/dumper (VGA mode 13h), oracle `tools/dax_decode.py`. Build:
`.\build.ps1 -Target cgb` → `build\cgb.com`.

```
CCGB <file.dax> [n]        show TOC block index n (default 0) in mode 13h
CCGB /D <file.dax> [n]     decode-only -> CCGB.RAW (imgw,imgh,indices,768-pal),
                           no mode switch -- the oracle-diff dump format
CCGB /B id /I out.gbi <file.dax>
                           emit logical DAX block `id` as a row-major GBIM v1
                           resource for CCFP/CCCOMBAT presentation
CCGB /F <file.gbi>         view an already-decompressed standard frame
CCGB /G <file.dax> [n]     FONT mode: block n is a flat 1bpp 8x8 glyph strip
                           (CoK 8X8D1.DAX block 201, no standard frame header --
                           oracle: packages/engine/src/loaders/cokFont.ts) -->
                           renders every stored glyph as a 16-column atlas sheet
CCGB /T <file.dax> [n]     TILE-SHEET mode: block n is a full 8X8D DOS tile
                           strip (header h=8,w8=1,count@8 -- oracle:
                           packages/engine/src/loaders/tiles8x8.ts) --> renders
                           ALL N tiles as one width=N*8 x 8 strip (mirrors
                           ccdaa.asm's Amiga decode_8x8d for chunky 4bpp), not
                           just tile 0 as the standard-frame path does
```

`/G`/`/T` combine with `/D` in either order (e.g. `CCGB /D /T 8X8D1.DAX 3` dumps
the full tile-strip sheet instead of displaying it). As with CCDAA, the >320x200
size gate only applies to the mode-13h display path — `/D` dumps any size, which
large tile counts need (e.g. a 70-tile CoK bank renders 560 px wide). Verified
byte-identical (0 mismatches) against the TS decoders, per-glyph and per-tile,
for real `Champions of Krynn/8X8D1.DAX` fixtures: font block 201 (177 glyphs)
and tile blocks 11/12/23/31/32 (70 tiles each), 202 (38), 203 (45).

`CCGB /B id /I out.gbi` supplies the equivalent bridge for original DOS DAX
standard frames, selecting by the archive's logical block ID rather than a TOC
ordinal. Its output has the same GBIM v1 header and indexed-pixel/palette
contract as CCDAA. `cgb-gbim-test.ps1` proves DoK `BIGPIC1.DAX` logical block
112 emits a valid, nonblank 304x120 resource, and `PIC2.DAX` logical block 96
emits its real animated frame-0 88x88 resource. This is the explicit fallback
when a requested scene is absent from the extracted Amiga archive.

## cc tool: CCDAA (`src/ccdaa.asm`)

Amiga `.DAA` graphics viewer/dumper (VGA mode 13h), the big-endian planar
cousin of CCGB. Oracle: `tools/daa_decode.py` (9-byte-TOC standard frames +
8X8D tile strips) and `tools/subframe_decode.py` (6-byte sub-frame index).
Build: `.\build.ps1 -Target ccdaa` → `build\ccdaa.com`.

```
CCDAA L <file.daa>          list every TOC entry (both container kinds)
CCDAA <file.daa> [i]        show TOC/index entry i (default 0) in mode 13h
CCDAA <file.daa> [i] /D [out]
                             decode-only -> `out` or CCDAA.RAW
                             (imgw,imgh,indices,768-pal), no mode switch
CCDAA <file.daa> [i] /T [out]
                             emit a versioned row-major GBTS tile resource
CCDAA <file.daa> /B id /I [out]
                             emit a versioned row-major GBIM image resource
```

Three container shapes share one dispatcher: the 9-byte BE TOC (standard
32-colour 5-plane frames, oracle-verified against `daa_decode.py`), the CoK
4-plane `8X8D*` tile strip (`decode_8x8d`, mirrors CCGB's DOS chunky
equivalent), and the 6-byte sub-frame INDEX family (`SPRIT*`/`PIC*`/big
`HEAD*` — monster sprites and portrait art).

The engine target includes `CCDAA.COM`. `/T` writes `GBTS` version 1: logical
block id, row-major flag, 16/32-colour palette flag, tile count, strip width,
pixels, and palette. CCFP `/U first.gbt /V second.gbt` keeps two validated GBTS
resources in dedicated scratch segments and resolves them by logical block id,
with DAX fallback per wall set.
The headless suite proves the real CoK block-203 resource produces byte-identical
pixels to DOS, then mutates the same valid resource and proves rendered pixels
change. A second block-202 fixture proves independent palette selection without
changing unreferenced pixel indices. The suite also exercises the complete
`GBBOOT /E /X /G 2` helper chain and switches both entries together.

`GBIM` version 1 carries a logical picture ID, row-major flag, 32-colour flag,
width, height, pixels, and palette. CCFP `/I art.gbi` draws it only when its ID
matches the active CCECL `GBES.pic`; missing, malformed, and nonmatching images
retain the DOS encounter marker. GBBoot reads that state after CCECL and resolves the
combat-icon archive at the game root, `DISK2`, or `GAME`: `CPIC1.DAA` through
CCDAA when `/G 2` both requested Amiga and located it, otherwise -- since round
36 -- the retail `CPIC1.DAX` through CGB on `eng_dax_gen1` profiles. Before that
change the Amiga archive was this bridge's only source, so every non-Amiga
graphics set drew no tactical icon at all. The live `G` control switches wall and encounter presentation
together without changing pose, map, ECL state, or encounter distance. `/J`
remains the deterministic wall-set snapshot control; combined GBIM `/J` coverage
is still pending.

**First-person encounter art (DOS), T6-2/T6-3, 2026-10-13.** `CCFP`'s `load_gbim`
and `draw_effect_setup` no longer require `graphics_alt_enabled`: a validated GBIM
whose block id equals `GBES.pic` replaces the colour-12 marker on every graphics set
(the id match is the provenance control and stays). `GBBOOT`'s `prepare_alt_graphics`
gained a `.dos_image` arm for the non-Amiga case (`/G 1`, or Amiga requested but
absent): on `eng_dax_gen1` with a textured route it reads `GBES.pic`, finds
`CPIC1.DAX` via `find_dos_cpic`, and runs `CGB /B pic /I <altimage> CPIC1.DAX`.
Measured, DOSBox 0.74-2 headless, CoK data only: (a) standalone
`ccfp-encounter-art-test.ps1`, CPIC1 block 5 at distance 1 (2x) and 3 (1x), frames equal
the `tools/encounter_art_model.py` compositor over the marker-free baseline with 0
mismatching pixels (355 and 52 painted pixels), the id-mismatch and no-`/I` controls
still draw the marker, a zeroed pixel plane changes the frame, and the DAC entries
0..15 equal the GBIM EGA-16 palette >> 2; (b) `gbfp-encounter-dos-test.ps1`, a
synthetic one-block ECL (`GBES` pic 5, distance 2) over the real CoK GEO1/WALLDEF1/8X8D1/
CPIC1 under `GBBOOT /E /X /Q 7 /G 1`: all 201 opaque icon pixels exact, no difference
outside the icon and marker rectangles, 746 -> 186 colour-12 pixels versus the same route
without `CPIC1.DAX`, and a block whose payload is overwritten no longer matches. Each gate
was reverted in turn and the owning test went RED. NOT measured: DoK, any other Gen1
title, `/G 2` frames (unchanged by construction only), a natural-play route to a real
`SETUP_MONSTER`, the colour-0 transparency fidelity limit (black icon pixels are see-through),
and what the `G` key does to the DOS icon (`toggle_graphics` flips `graphics_alt_enabled`
and `gbim_enabled` together).

Full-screen ECL scenes use a separate `CCFP /K scene.gbi` channel. CCFP scans
the bounded `GBSX` table for the latest opcode `0x0E PICTURE`, requires an exact
logical-ID match, applies the scene palette, and draws the opaque image at the
classic `(8,8)` origin while retaining the message band. GBBoot resolves
`BIGPIC1.DAA` in the same root/`DISK2`/`GAME` layouts and emits `_GBSCENE.GBI`
on demand. If an extracted Amiga archive lacks the exact requested logical
scene, GBBoot asks CGB for the original `BIGPIC1.DAX` block instead; it never
substitutes an unrelated Amiga image. Virtual overland GEO ids use map-34 only
as hidden CCFP backing geometry while the opaque scene owns the viewport. Scene
failure is independent of CPIC and wall fallback. The headless suite verifies
every pixel of real CoK BIGPIC block 114 and the complete CCECL to GBBoot to
CCDAA to CCFP route; the DoK flow also verifies ECL1#17 picture 112's DOS
fallback GBIM pixels in the CCFP framebuffer.

`CCFP /H x y` is the bounded transparent-overlay companion to `/K`: it loads
the paired `_GBAMIGA.GBI` sidecar without spending another long DOS command-tail
path, then draws it unscaled at the recovered coordinates. CoK's ECL2#57
shopkeeper record is therefore rendered from its actual `HEAD2.DAX#69` at
`(24,24)` and `BODY2.DAX#68` at `(24,64)`, not a substituted PIC frame. The
CoK attract probe copies both source archives and requires the replay trace to
contain PICTURE 70 followed by this PICTURE 68 composite.

For DoK ECL1#16, GBBOOT also replays each reachable pre-combat `PICTURE` record
in source order before tactical handoff. `_GBPICS.BIN` is a versioned trace of
the *latest* handoff's logical IDs and `_GBPIC.RAW` retains its final frame.
The ordinary stepped route can resume into a later combat handoff, which
replaces that trace with a source-order suffix; the scene-flow test captures
each distinct trace during the DOSBox session and requires the complete initial
`112 -> 96 -> 113 -> 77 -> 112` sequence before accepting that later suffix.
The playable-flow test currently verifies the complete `112 -> 96 -> 113 -> 77 -> 112` sequence and
its final 304x120 BIGPIC frame at `(8,8)`. Picture 77 is decoded from its
original `PIC5.DAX` logical block rather than being substituted or skipped.

DoK's CCFP ACK chunks now resume through the v9 `resumepath` selected by
GBBOOT, including when the consumed input was a v15 ACK or a v9 combat result.
Before each menu ACK is shown, GBBOOT replays that chunk's pictures, reloads the
validated effect header after the renderer uses its scratch buffer, and keeps
successful picture IDs in source order across subsequent ACK and combat yields.
The playable-flow gate verifies the five-picture opening trace and the final
BIGPIC frame, then drives the retail ACKs through focusless GameLink input.
That helper attributes each capture to the effect file actually opened by the
active CCFP invocation, since DOS file timestamps can tie while `_GBECL.BIN`
and `_GBRES.BIN` contain different continuation states.

`gbdok-demo-probe.ps1` is the corresponding disposable retail attract gate:
`GBBOOT /E /X /A 1 /B 2` preserves the real Sir Dryden/Tanar/Flavius joins and
staged combat, then proves the bounded source prefix `PICTURE 78 -> 60`. Both
records are decoded from their original animated `PIC4.DAX` blocks (frame zero)
and the final 88x88 GBIM is captured in the native 320x200 scene snapshot.

The 64-record `GBSX` area is part of the stable v9 `GBEF` prefix and is shared
by CCECL resume, CCEFX inspection, CCFP text overlays, and GBBOOT. `CCFLOW`
extends only a saturated effect through its versioned GBSL sibling; CCEFX reads
that stream. CCFP validates and streams its complete narration and PICTURE records. GBBOOT
launches CCFLOW for fresh Gen1 DAX ECL execution, validates the flagged effect, and
uses CCHOST to apply the supported DAMAGE policy from the same validated stream.
For DoK, the fixed terminal prefix takes that same helper path as a saturated
stream: CCHOST updates compact GBD1 HP and mirrors a real low-numbered source
slot to both observed `SAVE\CHRDATA#.GAM` HP bytes (40 and 214), so a cold
CCPARTY import cannot restore pre-effect health. Fresh HLIB (`DQK`/FRUA)
execution remains direct CCECL: DQK area 2 stayed live
after six saturated chunks (384 records) and 180 seconds, so its source/host
interaction continuation is still required. This is not a
complete attract-script transport: the retail CoK and DoK demo entries both
continue with additional narration, picture animation, walk calls, and
post-combat prose after that window. Extending native attract playback must
therefore use a separately versioned, append-only transport or a segment-aware
execution/replay protocol; enlarging or relocating the prefix is incompatible
with existing resume consumers. The current probes prove the recovered picture
prefix and combat handoff, not the complete retail demo sequence.

Tactical combat accepts the same image resource through `CCCOMBAT /I icon0.gbi`.
The native encounter expander now retains each GBEF group `picBlock` beside the
combatant state. A matching resource is transparent-index blitted and fitted to
the existing 14x14 or 30x30 tactical footprint; nonmatching combatants retain
the DOS-side rectangle. A final digit before `.GBI` starts a contiguous numbered
series: CCCOMBAT validates and packs up to eight files in one 64 KB segment,
indexes them by embedded logical ID, and stops cleanly at the first missing file.
GBBoot deduplicates all queued encounter-group IDs and emits successful
decodes as `_GBCP0.GBI` through `_GBCP7.GBI` without holes; since round 36 that
dedupe and emission are shared by both platforms' sources rather than being a
`/G 2` path. Decode failures fall
back independently rather than shifting IDs or using the wrong art. Combat
rules, traces, outcomes, and resume state are unchanged.

Combat RAW snapshots now copy the actual mode-13h framebuffer. The former row
reconstructor hid a `DL` colour-clobber bug in both line primitives; preserving
`DX` across address multiplication makes headless snapshots authoritative. The
suite checks real CPIC substitution and then reruns all exact combat trace and
outcome gates.

**The 6-byte sub-frame index is now SOLVED end-to-end (2026-07)** — it used to
list as `SUBFRAME (unsolved)` and refuse to decode. Port of `rleAmigaSprite()`/
`decodeAmigaSubEntry()` in `packages/engine/src/loaders/daa.ts` (itself cracked
by disassembling the Amiga `game` 68000 executable — see `docs/daa-format.md`
§1b, `docs/engine/research/subframe-format.md`). Each 6-byte TOC entry `{u8
id, u8 0, u32 subOffset(BE)}` points at a compressed body holding a header +
32-colour palette segment followed by `numDist` "zoom level" frames, all
decoded off ONE running stream position via `decode_ars` — a **different**
signed-byte RLE than the outer container's `decode_rle`, despite looking
superficially similar (their `0x80` opcode diverges: the outer scheme repeats
a byte 128 times, the inner scheme is a no-op; the inner scheme's `0x81..0xff`
repeat-count formula is also off-by-one from the outer's). `probe_subframe`
peek-decodes the fixed header fields (geometry sanity-checked exactly like
`decodeAmigaSubEntry`: widthDiv8 1..64, height 1..256, numDist 1..16);
`decode_subframe` then reseeks and re-decodes the header at its *exact*
`pixOff` length (a flat/peek decode can't be sliced — a completing RLE op can
straddle the cut point), reads the palette, and decodes exactly
distance-frame 0 (the primary/closest zoom level, matching
`frameSet.frames.set(..., sf.frames[0])` in `daa.ts`) through the **same**
`planar_to_indices` 5-plane unpacker the standard-frame path uses (now
parameterized via `[pixbase]`/`[palsrcoff]` instead of the hardcoded
`FRAME_HDR`/`9` constants, so both paths share one verified routine). `CCDAA
L` on an index-family file now prints real geometry (`"88x88 x3 B12.DAI"`)
instead of the unsolved placeholder; a handful of known mis-routed CPIC1/HEAD1
entries that fail the header sanity check still fall through to the shared
"complex/unsupported frame" message rather than rendering garbage.

**Verification**: headless DOSBox run of `CCDAA <file> <i> /D` against real
`amiga_extracted/{ChampionsOfKrynn,DeathKnightsOfKrynn}/.../{SPRIT1,PIC1,pic1}.DAA`
fixtures, diffed byte-for-byte (index buffer + 768-byte palette) against an
independent Python oracle (a from-scratch raw-TOC-order parse + the verified
`subframe_decode.decode_amiga_subframe`, not importing any asm-mirrored code):
**12/12 sampled entries pass** (first/middle/last TOC position in each of the
4 files), all 88×88 with the palette and pixel indices matching exactly.
`CCDAA L` across the same 4 files lists **64/64 entries** with plausible
geometry and zero `(bad/implausible header)` fallbacks, matching
`subframe_decode.py --list`'s per-id width/height/numDist exactly.

## cc tool: CCHLIB (`src/cchlib.asm`)

DQK/FRUA-style HLIB/DataLib browser and image decoder. Image libraries
(`TILE` leaves and `HLIB` masters) decode VGA Chain-4 methods 16/17/18/21/23;
DATA/DIG4 libraries list/extract opaque members instead of being mis-walked as
images.

```
CCHLIB L <file.tlb/.glb>              list images or DATA members
CCHLIB X <file.tlb/.glb> <i> <dir>    extract raw image/member span
CCHLIB <file.tlb> <i>                 display decoded image i
CCHLIB /D <file.tlb> <i> [out.raw]    dump decoded image: u16 w, u16 h,
                                      w*h indices, then 768-byte RGB palette
CCHLIB W <file.tlb> [set out.gbw [count]]
                                      summarize 47-image DQK/FRUA wall sets;
                                      optionally dump count decoded wall sets
CCHLIB S <master.tlb> <id> <dir>     extract an id-addressed nested leaf as
                                      <dir>\Snnnn.HLB without overwriting
```

`CCHLIB S` reads the master `HLIB` member-0 `{id, pointer-index}` table,
validates the selected leaf span, then copies that exact nested HLIB range to a
new file. It rejects missing IDs, invalid pointer indexes, short reads/writes,
and an existing destination. Runtime extraction is still pending a focus-safe
DOS environment.

The optional `/D` output path keeps legacy `CCHLIB.RAW` oracle dumps intact
while giving other native tools and smoke tests a deterministic bridge file.
Amiga `GLIB` containers are accepted for the safe opaque-member DATA role after
big-endian pointer metadata is swapped, but GLIB image/TILE rendering is
deliberately not enabled yet: real Amiga nested TILE directories do not match
the DOS HLIB image pointer shape, and `CCHLIB W` rejects those inputs instead
of writing bogus GBWS wall bundles. The art smoke pins this guard with a
synthetic GLIB image master while still proving GLIB DATA member listing.
`CCHLIB W` verifies the DQK/FRUA wall-art inventory shape: `8X8DB.TLB` is
`9 * 47` images and `8X8DC.TLB` is `8 * 47`, both with zero remainder, and
reports the documented per-wall-set group pattern `10,10,9,9,9`. It also reads
each image header and reports method-21 coverage plus non-wall method counts.
With `[set out.gbw [count]]`, it emits a `GBWS` stream: 16-byte header (`GBWS`,
version, starting set index, image count, group pattern), followed by
`count * 47` `GBWI` records containing local/global image id, width, height,
pixel count, palette window, draw method, group id, the original signed HLIB
y/x placement offsets, raw pixels, and a 768-byte palette. This is the native
handoff format for the DQK/FRUA first-person wall compositor. `CCFP <out.gbw> /Q /R`
consumes that stream and dumps `GBWVIEW.RAW`, a 320×200 mode-13h contact sheet.
`CCFP <walls.bin> /F <out.gbw> /R` applies the same GBWS images to CCFP's
existing far/mid/near wall-walk and dumps a coarse first-person preview. CCFP
composes the active GBWS DAC by merging each `GBWI` palette window, so later
wall chunks can contribute colours outside the first image's palette slice.
`/F` uses the documented group order (far/near/up-close front/left/right), the
GEO slot slice `(slot-1)%5`, the slot wall-set quotient `(slot-1)/5` when a
multi-set bundle is present, and the GBWI placement offsets. Those offsets use
the UA/HLIB sign convention from `TLBFORM.TXT`: positive vertical moves the
image up and positive horizontal moves it left. Per
`hackdocs_extracted\UAIMPORT.TXT`, groups 1 and 2 contain the extra far-side
image used by the far cap; groups 3 through 5 do not, so CCFP skips those cap
draws instead of aliasing them to the main far-front image. `CCFP ... /F
<out.gbw> /P` indexes the same GBWS bundle and appends `gbwIndex=` to each
`PLAN.TXT` placement line (`-1` means a documented no-image cap skip), so the
Gen2 wall image selection can be verified without opening a graphics mode.
Legacy one-set GBWS files still render by
falling back to set 0 for every wall slot. `/F /W`
uses the same interactive movement loop as the outline and Gen1 textured
first-person views, which is the path `GBBOOT /E` uses for DQK-class HLIB
installs. `/F /S [out.raw]` writes the same first-person frame to
`CCFPVIEW.RAW` or an explicit output path, matching the Gen1 snapshot interface
while preserving the active GBWS palette. `CCGEO`
now resolves nonzero DQK `GEO.GLB` map ids through the HLIB id
table, so script-emitted ids such as 26 select the correct member instead of a
positional index.
`native\cchlib-dqk-art-test.ps1` checks those groupings, then decodes
representative DQK wall/tile-bank libraries (`8X8DB.TLB`, `8X8DC.TLB`,
`DUNGCOM.TLB`, `WILDCOM.TLB`) into explicit RAW outputs and verifies their
decoded dimensions. It also renders first-person GBWS frames from both
`8X8DB.TLB` and `8X8DC.TLB`, so the GBBOOT wall-library split is covered at
the compositor boundary, checks `/F /P` image-index selection against a three-set
GBWS bundle, verifies signed GBWI offsets with a one-pixel sentinel render,
verifies transparent-key clipping with an exact-pixel sentinel,
verifies palette-window composition across GBWS images,
and verifies the DQK/GBWS `/F /S` snapshot path writes
`CCFPVIEW.RAW` with the message-band text overlay and the `GBCL` clock-driven
sky band/body on an open GBWS first-person frame. `native\ccfp-effects-test.ps1` also exercises CCFP's
headless `/M` movement trace on CoK/DoK Gen1 wall maps, a synthetic WGRD
door/gateway movement override, DQK logical GEO area 2's 10x10 `WGRD` output, a
real DQK `GEO.GLB` + `GBWS` first-person RAW frame, and the `/S [out.raw]`
framebuffer snapshot path. `/S` renders one normal
first-person frame, applies any `/E` v6+ `GBSX` text overlay or v9 `GBCL`
clock fallback, paints the `GBCL`-driven sky band/body when that tail is
present and the optional WGRD roof byte is not marked indoor, dumps
`CCFPVIEW.RAW` or the supplied output path (`u16 320`, `u16 200`, 64,000 indices, 768-byte palette), and
exits without waiting for a key. The same smoke now pins a roofed-cell RAW
snapshot where the clock overlay remains visible but the sky band/body stay
black. `CCFP.COM` clears its un-emitted absolute
scratch span on startup, rejects malformed short legacy raw grids, and rejects
GBWS images whose declared pixel count does not exactly match `width * height`,
so stale DOS memory cannot become live wall or wall-art pixels. This keeps the native HLIB art path
covered while pixel-faithful DQK/FRUA placement continues to tighten.

## cc tool: CCMON (`src/ccmon.asm`)

> **⚠ THE PROSE BELOW DESCRIBES THE SUPERSEDED DECODE — 2026-08-21
> (`../docs/engine/research/cok-m4-fidelity-plan.md` §29).** Every member of `MONCHA.GLB` begins
> with a **2-byte big-endian uncompressed length**; the `monchaRLE` stream starts at byte **2**, not
> byte 0. This is not an inference — DQK's own loader reads that word (disassembled at file
> `0x3570C`) and passes it to the decompressor at `00d7:0a1c` as the bounded expected output size.
> Header vs decoded length is exact for **98 of 98** shipped members. Both this project's readers
> decompressed from byte 0, consuming the length word as two RLE control bytes, so every record was
> out of phase by a record-dependent amount. `packages/engine/src/loaders/moncha.ts` was corrected in
> commit `df69707`; **`native/src/ccmon.asm`'s own header comment is the authority on where the
> native side currently stands** — read it before trusting any number in this section.
>
> What the corrected bytes actually say, and what that makes stale below:
> - **Record layout.** Not `type@2 / xp@4 / name@24 / ability@40 / …`. In the decompressed record
>   (i.e. *after* skipping the length word) the name is at a **fixed `0x68`** and the ability block
>   at a **fixed `0x78`** in **all 98** members; the stat fields sit at the same `ABILITY_DELTA`
>   offsets from the ability block that were always in the table (THAC0 +15, saves +19, HD +25, dmg
>   +61/+63/+65, AC +67, AC/THAC0 stored `60−x`). Tail counts at `0x19E`/`0x19F`; fixed part ends at
>   `0x1A0` = 416. There is **no record-type byte at offset 2** — offset 2 was inside the length
>   word. Category comes from an is-monster flag at `0x66` and a race byte at `0x58` (6 = humanoid).
> - **Coverage.** "5 of 98" and "46 of 98" were both measured against the shifted oracle and are not
>   facts about `MONCHA.GLB`. The corrected reader decodes **86 of 98** with full validated stats
>   over a **74 monster / 8 humanoid / 5 sub / 11 npc** roster. Re-measure the tool's own figures
>   against its current build rather than quoting these.
> - **`reconstructDqkRecord` + `findAbilityBlock` (strategy 1).** Its premise — "the inner stat block
>   is still RLE-compressed inline" — is **false**. A second RLE pass over a shifted stream merely
>   happens to re-synchronise it. A correct reader needs no reconstruction and no ability-block
>   search; the dec-path/recon fork (strategy 2) has nothing to choose between; the `COMPACT_DELTA`
>   short-tail layout (strategy 4) was a reading of shifted bytes.
> - **Canon-AC injection (strategy 5).** **RETIRED.** UMBER HULK's AC 2 *is on disk*; nothing was
>   consumed by the compressor. Archive-wide injected-value count is **0** — no monster in
>   `MONCHA.GLB` carries a fabricated stat.
> - **Names.** `IRON OLEM`, `SAUAGIN`, `UMBERHULK`, `TASLEHOFF`, `SKEL WARROR`, `UVWW.`,
>   `THENOL FNATIC`, `PRINCE ALHOOK`, `BLACK OGUE`, `THENOL WIARD`, `DRK WIZARD`, `SELIA`,
>   `BAKAI SHAMAN`, `SHARMAN` are **decode artefacts**. They read `IRON GOLEM`, `SAHUAGIN`,
>   `UMBER HULK`, `TASSLEHOFF`, `SKEL WARRIOR`, `LICH`, `THENOL FANATIC`, `PRINCE TALHOOK`,
>   `BLACK ROGUE`, `THENOL WIZARD`, `DARK WIZARD`, `SELIAS`, `BAKALI SHAMAN` — and "SHARMAN" is not
>   a record at all. None of them should be quoted as a game fact again.
> - **`BAKALI SHAMAN` is a monster**, not a level-9 cleric: its is-monster flag is 1 and its 9 is
>   **hit dice**. `THENOL FANATIC` is race 6 = humanoid; `PRINCE TALHOOK` decodes as a monster with
>   real stats (AC −2, 10 HD, THAC0 8, 1d6+3). The "8 real character/NPC records" set was an
>   ability-spread heuristic; the byte-grounded NPC set is the **11** records whose `0x66` flag is 0.

DQK **`MONCHA.GLB`** monster-record decompressor + field-dumper, oracle
`packages/engine/src/loaders/moncha.ts` (layout) and
`packages/engine/src/util/rle.ts` (`monchaRLE`). Until this tool, `MONCHA.GLB`
was only reachable through CCHLIB's generic DATA-library browser, which lists
members as opaque **still-compressed** `Dnnnn.HTD` blobs — nobody decompressed
or field-parsed the monster records. Build: `.\build.ps1 -Target ccmon` →
`build\ccmon.com`.

```
CCMON L <file.glb>            list every record: "<decLen> Mnnnn.MON <0|1> <name>"
                               (0|1 = whether the fixed-offset stat block decoded)
CCMON <file.glb> <i>          view record i's fields (i = 1-based; member 0 is
                               the id table, not a record)
CCMON X <file.glb> <i> <dir>  extract record i's DECOMPRESSED bytes (byte-exact
                               monchaRLE output) to dir\Mnnnn.MON
```

**monchaRLE** (control byte `c`): `c<=0x80` copies the next `c+1` bytes
literally; `c>0x80` repeats the next single byte `257-c` times. This is the
DQK-specific variant used only by `MONCHA.GLB` — it differs from the DAX/DAA
signed-byte RLE CCGBC/CCDAA/CCHLIB use (boundary `0x80`, repeat count
`256-c`) by having both the boundary and the repeat count one higher.

**Scope**: CCMON implements moncha.ts's *direct* fixed-offset decode
(`sniffDqkMonster` + `decodeDqkMonsterRecord`, ability block fixed at offset
40, **before** any reconstruction) — type@2, xp@4, name@24 (16 bytes,
NUL-padded), 6 abilities@40 (2 bytes each), thac0@55 (`60-byte`),
saves@59-63, hitDice@65, damage `count`@101/`sides`@103/`bonus`@105 (signed),
ac@107 (`60-byte`); `hitPoints` is computed (not stored) as
`max(hitDice, round(hitDice*4.5))`. This alone cleanly validates **5 of 98**
creature records on the real `MONCHA.GLB` (DISK2). On top of that, CCMON also
ports 6 of moncha.ts's extended-reconstruction strategies (`decode_extended`,
mirroring `decodeFullStatMonster` + `decodeMonchaGlb`'s NPC fallback), always
tried only after the fixed-offset test fails:

  1. `reconstructDqkRecord` + `findAbilityBlock` — splices the verbatim
     header+scanned-name with a second `monchaRLE` pass over the tail (the
     stat block itself is inline-RLE-compressed for these records), then
     scans for the 12-byte all-`[1,25]` ability block.
  2. The "dec-path" fallback — `findAbilityBlock`/sniff on the RAW
     (unreconstructed) decompressed member, for records whose stat block is
     already expanded and a second RLE pass would re-compress it.
  3. `isMonsterDefaultAbility` — extends monster-framed decode to non-type-8
     records (Sahuagin/Spectre/Wraith/Fire Giant/Skeletal Warrior/...) whose
     ability block is the monster default (all-10s, or the INT-18
     "intelligent monster" pattern), rejecting rolled character spreads.
  4. The compact/short-tail layout (HYDRA) — attack/damage/AC packed 21
     bytes early (`COMPACT_DELTA`) when the standard stat block doesn't
     validate.
  5. Canon-AC injection (UMBERHULK only, matching moncha.ts's `CANON_AC`
     table exactly — its on-disk AC byte was consumed as a monchaRLE opcode
     during compression and is unrecoverable), gated on
     `sniffAtAbilityExceptAc` AND an exact name match.
  6. Character/NPC framing (`isRolledAbility` + `decodeNpcRecord`) — the
     rolled-ability-spread records (named bosses, e.g. TASLEHOFF) decode
     their real thac0/HP/level/class/AC at the NPC deltas, reported as
     category `npc`, never merged into the monster fields.

**Not ported** (documented, not silently dropped): moncha.ts's roster-only
category refinements — `isDragonHeadSubRecord` (5 dragon "HEAD" sub-records →
category `sub`) and `TYPE8_NPC_NAMES` (THENOL FNATIC / PRINCE ALHOOK →
category `npc` despite a type-8 byte). Both only relabel the roster category
of records that carry **no** decoded stats either way (`hasStats` stays 0);
CCMON's CLI has no roster-category field at all (only the `L`-listing's `0|1`
flag and the view command's `category:` line, which only prints once a
record *did* decode), so porting these two name-lookup special cases would
change zero observable CCMON output. Skipped as purely-cosmetic dead code for
this tool.

For every one of the 98 records, `L` and the no-clean single-record view
still resolve a **name** via the same offset-independent `scanMonsterName`
scan moncha.ts uses (longest run of `A-Z`/space, ≥3 chars, ≥2 uppercase
letters, at or past offset 16).

**Verified coverage: 46 of 98** real `MONCHA.GLB` (DISK2) records reach full
decoded stats — an exact match with moncha.ts's own `decodeMonchaGlb().decoded`
count on the same file, confirmed two ways:

- **Set-level**: `CCMON L MONCHA.GLB` run for real under DOSBox (headless,
  autoexec + stdout redirection) lists all 98 members with each one's `0|1`
  full-stats flag; the resulting `records: 98 / fixedOffsetStats: 5 /
  fullStats: 46` summary's set of 46 flagged member indices was diffed
  against `moncha.ts`'s `decodeMonchaGlb(...).roster.filter(r =>
  r.hasStats).map(r => r.memberIndex)` (run directly, via `tsx`, against the
  same real file) — **identical sets, zero differences**, both ways.
- **Field-level**: `CCMON MONCHA.GLB <i>` was run under DOSBox for 4
  representative members spanning all three non-trivial decode paths —
  member 1 (BLACK PUDDING, fixed-offset), member 80 (BALDRIC) and member 42
  (2 HEADED TROLL) (both via `reconstructDqkRecord`+`findAbilityBlock`), and
  member 94 (TASLEHOFF, NPC framing) — and every printed field (xp,
  abilities, thac0, ac, hitDice, damage, hitPoints, saves, npcClass/npcLevel,
  category) matched moncha.ts's own decoded record for the same member
  exactly.

This session's port surfaced and fixed two real bugs in `build_recon`, both
the same class (a plain, non-`cs:`-prefixed read of a cs-resident global
performed *after* `ds` had already been switched to `dec_seg`'s segment for
the verbatim header/name copy, silently reading 2 garbage bytes out of the
current record's own decompressed data instead of the intended variable):
`mov cx,[recon_end]` (corrupted the copy length — data-dependent, only
visibly broke for records like member 80/BALDRIC whose data at that cs
offset didn't look like a plausible length) and `mov ax,[recon_seg]`
(corrupted the `rep movsb` destination segment — the copy silently wrote to
a garbage segment, leaving the real buffer's head zeroed while the
later-written RLE tail landed correctly, producing a corrupt spliced buffer
that hung `find_ability_block_g` scanning it; caught on member 3/WHISPER
SPIDER). Both are now `cs:`-prefixed; see the inline comment on `build_recon`
in `ccmon.asm` for the full account.

### CCGLB dispatch: MONCHA-shaped `DATA` libraries now route to CCMON

`src/ccglb.asm`'s `classify` routine previously sent every `DATA`-tagged
`.GLB` that failed `sniff_geo`'s GEO-shape test straight to CCHLIB (its only
DATA-family case: ECL.GLB or MONCHA.GLB). It now adds a `sniff_moncha` step in
between: `GEO.GLB`, `ECL.GLB`, and `MONCHA.GLB` all share the *same* member-0
"id table" shape (`u16 count` + `count * 4` bytes — verified against the real
files: GEO 20 entries, ECL 47, MONCHA 98), so a member-0 shape test can't
discriminate them the way it can for GEO. What *does* discriminate:
`MONCHA.GLB`'s members[1..] are monchaRLE-compressed fixed-offset monster
records, while `ECL.GLB`'s members are raw (uncompressed) ECL bytecode.
`sniff_moncha` walks members 1..N (same short-circuit, first-hit-wins style
as `sniff_geo`), monchaRLE-decodes each, and applies the same plausibility
test CCMON's own `sniff_dqk_monster` uses. Verified against the real files:
`MONCHA.GLB` 5/98 members pass, `ECL.GLB` 0/47, `GEO.GLB` 0/20 (moot — GEO is
already caught by `sniff_geo` first). Updated dispatch tree:

**⚠ 2026-08-21 (fidelity-plan §29):** the `5/98` figure is a property of the **superseded**
byte-0 decode (see the CCMON banner above) and is not a fact about `MONCHA.GLB`. The
*dispatch* is unaffected — first-hit-wins on 5 of 98 still routes correctly, and the
discriminator itself was re-measured and holds: `ECL.GLB`'s 47 `DATA` members are indeed
uncompressed (all begin with the constant `01 01`, and **0 of 47** carry anything that
behaves like a length or a compressed record), while `GEO.GLB`'s 20 members are
uncompressed maps whose first two bytes are width/height (`0a 0a` → 408 = 10·10·4+8,
`1c 1c` → 3144 = 28·28·4+8). Only `MONCHA.GLB` in this trio is RLE-compressed, and it is
the one library that carries the big-endian length word.

```
DATA tag -> sniff_geo pass?  -> CCGEO
            sniff_geo fail   -> sniff_moncha pass? -> CCMON
                                 sniff_moncha fail  -> CCHLIB (generic DATA browse; ECL.GLB)
```

## Milestones

- **Slice 1 — pixel on screen.** `src/pixel.asm` enters mode 13h, paints the
  256-colour DAC as a 16×16 grid, waits for a key, and restores text mode.
- **Format tools.** `CCDAT`/`CGB`/`CCDAA`/`CCGLB`/`CCGEO`/`CCHLIB`/`CCMON`
  cover the DAX, DAA, HLIB DATA/TILE, GEO, wall, image, and monster formats
  needed by the DOS-native path.
- **Native preview chain.** `CCECL` emits the compact effect bridge, `CCGEO`
  bakes a wall map, `CCHLIB W` emits DQK/FRUA wall-set bundles, `CCFP`
  walks the resulting first-person map in mode 13h, and `CCCOMBAT` runs the
  current deterministic Tier-1 tactical loop when ECL yields combat, including
  real CoK/DoK/DQK monster handoffs and CoAB's 422-byte `MON*CHA.DAX` records.
  `CCECL /R` resumes post-combat outcome branches from v9 `GBEF` state.
  `CCCOMBAT /V` also has the first flat tactical viewport for visual combat
  bring-up.
- **Boot front door.** `GBBOOT.COM` now detects and chainloads the Krynn
  trilogy, the broader AD&D Gold Box DOS games, Buck Rogers Countdown/Matrix,
  generic Gen1 DAX installs, DQK-class HLIB data dumps, generic HLIB/GLB map dumps,
  and FRUA-style HLIB installs. `/E` launches the
  native preview/combat chain where the current loaders have enough verified
  data, including default area-1 ECL starts for the broader named Gen1 games,
  CoK/DoK data-only folders, data-only DQK, Curse/CoAB, generic HLIB/GLB raw
  maps, raw HLIB/FRUA `/A 10` selection of the second GBWS wall bank, expanded
  real DQK HLIB ECL/GEO starts through `/A 66`, and
  generic Gen1 DAX dumps with no original executable.
- **Next.** Keep tightening DQK/FRUA `GBWS` placement against more real scenes,
  move the remaining DQK script-only/no-wall entries into focused VM-dispatch
  tests, and continue replacing
  chainloaded original executables with native engine loops one subsystem at a
  time.

Build artifacts and any decoded-asset inputs are git-ignored (`.gitignore`).

- **Round 8b (2026-10-07): DQK computer-controlled turns pick a uniformly random in-reach foe** (`cccombat-dqkai-test.ps1`; only the verified target-selection rule from `docs/engine/research/dqk-npc-ai-body.md` -- spell ladder, movement style, morale, hold-back, missile pick and the SPACE toggle are NOT modelled). Gate: DQK profile only (`party_dok==2` or the CCECL tag `fxbuf+17==0D0h`); CoK/DoK traces are byte-identical to `df78d13e` over `/T 0..60` plus `/E` configs. The pick uses CCCOMBAT's own `rng_die`, so there is no byte-exact claim against retail's generator. `dqk-combat-oracle.ps1` now models the pick draws and its party start cells were repaired; one golden moved in `gbdqk-combat-flow-test.ps1` (`attack p5 e0 ...` -> `attack p5 e1 15 11 1 2 34`), outcome unchanged. CCCOMBAT: 64,592 emitted / 64,848 resident / 432 free. Swept with the rosters above (38/38 and 43/43).

- **Round 9 (2026-10-07), merged, flow roster 38 -> 41 and swept below:**
  1. `CCHOST /N` now validates the effect exactly as `/D` does (version, status, length, NPC flag, sidecar flag against reason 10) and a duplicate join exits 0 with a logged skip, because after a menu resume the effect lists the same join again and the old exit 3 was fatal in GBBOOT (confirmed with a one-variable control on the previous CCHOST). Versions 2-8 and 10-13 are rejected, as in `/D`. CCHOST: 26,090 emitted / 19,404 free. This replaces the earlier statement that GBBOOT never calls `/N`: it calls it for any DQK effect carrying the NPC flag.
  2. CCECL has a short-frame dialect for Pools of Darkness and Treasures of the Savage Frontier (`POOL4.CFG` / `TREASURE.CFG`: LOAD_FILES and 0x37 take two operands, 0x1F one). The five inline marker probes are one `probe_marker` helper. Pools starts at ECL block 18 (from the earlier TypeScript VM sweep, confirmed clean statically); Treasures at block 20. Real-data flows: `ccecl-pools-flow-test.ps1`, `ccecl-treasures-flow-test.ps1`, with no-marker, DoK and payload-alias controls; the expected PCs come from `tools/gen1_init_block_sweep.py`, not from CCECL. Both go RED on the previous CCECL. CCECL: 23,550 emitted / 65,107 resident / 173 free. (The sweep's docstring once said the init block is the lowest clean id, which was wrong for Pools; retracted 2026-10-13: `tools/gen1_init_block_sweep.py` lines 8-12 now say the opposite, so this sentence is history only.) (Round 9 figure; the 8-row party change of 2026-10-07 moved it to 23,557 / 65,148 / 132 free.)
  3. GBBOOT keeps the checkpoint image in its own DOS block addressed through FS: 56,369 emitted / 56,625 resident / 8,655 free (was 462). Only 8,193 bytes moved: `rest_party` stays resident because the rest and memorize code addresses it with raw pointers. File format and checksum are unchanged, and the 105 checkpoint files the agent's runs wrote were byte-identical to the baseline tree. This unblocks the 8-row party, which is not started.
  4. `gbmatrix-flow-test.ps1` (Matrix Cubed block 19 -> GEO 17, `GBLP` set 5, geo0/oper/set/null controls). Wall set 5 is observable only as the `GBLP` line, and its value still rests on the uncertain 0x4C two-operand reading with no independent oracle. `gbdqk-create-test.ps1` now requires byte-exact `/R` heroes through `_GBDICE.BIN`.

### Round 10 note (2026-10-07): DQK takes 8 GBPR rows

- DQK now holds 8 GBPR rows; CoK and DoK stay at 6, gated in `gbboot.asm` and `cccombat.asm`. GBPR stays at version 2 and a 6-row file is byte-identical to before; GBCP, GBMR and GBLR are untouched because DQK never writes a checkpoint. Design and per-tool changes: `docs/engine/research/gbpr-8-row-design.md`.
- `CCHOST /N`: the 7th and 8th NPC join succeed (cases C40-C42 in `cchost-npc-test.ps1`), a 9th is deferred with exit 2 and GBPR byte-identical. `gbdqk-npc-join-test.ps1` covers 6 to 7, 7 to 8 and the deferred 9th; both were RED on the 86ed879c build and GREEN on the new one.
- New `cccombat-party8-test.ps1` (in the `$scripts` roster): DQK 7- and 8-row parties import and fight, a 9-row DQK roster and 7-row CoK/DoK rosters are refused; the 6-row DQK, DoK and CoK traces are byte-identical to the previous CCCOMBAT.
- Capacity after the change: GBBOOT 8,629 free, CCCOMBAT 416 free, CCECL 132 free (floors 128 / 128 / 64).
- Round 10 follow-up (2026-10-07): T3 moved CCCOMBAT's 32 KB `daxbuf` into its own DOS block addressed through FS (CCCOMBAT now 31,984 emitted / 32,240 resident / 33,040 free); T4 gave GBBOOT real first-map starts for Pools of Darkness (ECL1#18), Treasures (ECL1#20) and Gateway DOS (ECL2#1), claiming map entry only (GBBOOT now 56,497 / 56,753 / 8,527 free). The three titles are enrolled as `gbpools-flow-test.ps1`, `gbtreasures-flow-test.ps1` and `gbgateway-dos-flow-test.ps1`.
- The agent-run checks used its own worktree; the flow and scripts sweeps are recorded in `native/flow-status.json` and `native/scripts-status.json`, not here. **Corrected 2026-10-13:** this said they were recorded "on this source"; the committed artifacts predate this source, so quote them with their `repo_head` and do not read them as a measurement of it.

### Astra review follow-up (2026-10-08): GLIB raw monster buffer

The FS buffer move left `glb_raw_to_monraw` using an implicit DS source in
`rep movsb`. The raw 422-byte GLIB member path now uses `fs rep movsb`;
the destination remains the resident `monraw` buffer. The existing optional
Secret/Gateway smoke passed before this repair and did not establish correct
raw-member stats.

`cccombat-glib-moncha-test.ps1` now also runs a synthetic GLIB raw/RLE pair
with identical decoded bytes, effect and seed. It requires exact trace,
outcome and framebuffer equality, pins source-derived HP and attack values,
and changes hit dice to require HP to move from 32 to 36. The final fixture
failed against the preserved pre-repair binary and passed against the repair,
including with both external Amiga paths absent. DOSBox absence remains an
explicit SKIP. Logs and pre/post binaries are outside the repository under
`C:\temp\GoldBox-review-20261008`.

`tools/test_cccombat_daxbuf_segment.py` now checks the six SI buffer-walking
routines through their loops and implicit string reads. Each of the 39 FS
source sites has an isolated removal control requiring exactly its own line
to fail. This is a bounded source contract, not general assembly alias analysis.
CCCOMBAT capacity remains 31,984 emitted / 32,240 resident / 33,040 free;
the segment prefix is absorbed by existing alignment.

During the broader rerun, `gbcok-playable-flow-test.ps1` encountered a stale
16-byte zero `_GBEVT.DOP` left in shared test scratch. Its new-session cleanup
now resets `_GBECL.DOP`, `_GBEVT.DOP` and `_GBRES.DOP`, following the DoK
flow's existing contract. The full CoK flow passed with all three preseeded
as invalid tokens and regenerated valid GBDO v1 tokens. Tokens remain intact
between that test's persistence phases; CCBIND still rejects invalid tokens.

On this busy host, the same clean CoK flow timed out at BelowNormal priority
and passed when only its boot DOSBox process was assigned Normal, with the
same 40-second limit, cycles and assertions. `dosbox-smoke.ps1` now supports
`GOLDBOX_DOSBOX_PRIORITY=Normal`; BelowNormal remains the default. The option
also applies when cycles are inherited, without replacing the CPU setting.
It preserves hidden SDL dummy launches. The sweep artifacts record
`dosbox_smoke_priority_policy` as the requested policy for that helper;
it does not describe the separate GameLink launcher or guarantee observed
OS scheduling. Mocked launch tests cover both policies, preserved cycles,
environment restoration and invalid-value rejection before launch.

The component sweep exposed a separate test-tool portability error:
`cccombat-dokinit-test.ps1` and `cccombat-dqkai-test.ps1` piped a Git archive
to GNU-only `tar --force-local`, while Windows resolved `tar` to bsdtar.
Both now write a Git ZIP archive and use `Expand-Archive`, retaining the
same baseline revision, source files, includes and comparison assertions.
Both pass with the default Windows PATH; missing-revision controls fail
before baseline assembly or comparison.

Final verification on 2026-10-08: flow roster 44/44 PASS and component roster
44/44 PASS, both without skips, using the explicit Normal smoke policy and
default Windows PATH. Both artifacts bind unchanged source hash
`57d247786b3c4f826e89c064a2a4543afd15ad328fe2ba26f7ae05a108f3b2d8`, with
no measured retail file changes. Full corpus: 6,528 passed / 14 skipped,
exit 0; full TypeScript engine suite with one worker: 3,006 passed / 58
skipped, exit 0; workspace typecheck and all 16 native targets pass.
The corpus-contract repairs and complete evidence paths are recorded in
`../docs/engine/HANDOFF.md`.

Loader checkpoint verification (2026-10-09): full flow roster **44/44 PASS**
and the October 8 component roster **45/45 PASS**, without skips, bind clean
native source hash
`e8720542eb112a8b6f3cc5d97ad3d25082a7e5279131f3465111334f611c3976`.
The added `cccombat-moncha-bounds-test.ps1` emits `RESULT: ... PASS` after its
decoder/rejection assertions. The prior DoK timeout did not reproduce in
isolated or full serial runs, and no timeout/assertion was weakened.
The reviewed static manifest and fresh 16-target engine build pass.
Full corpus: **6,559 passed / 14 skipped / 84 warnings**, exit 0, using the
explicit Normal smoke policy. The full sweeps measured no retail file changes.
Logs and the retained failed attempts are linked from the handoff above.

Secret Amiga normal-melee profile (`/9 1`, task 235):

Use `GBBOOT /E /X /A 16 /@ 33930 /9 1` on the staged Secret GLIB data,
or append `/9 1` to standalone `CCCOMBAT /E` or `/K` with an explicit
MONCHA path. GBBOOT forwards this profile within the bounded DOS tail.
It is an explicit source selection; generic GLIB detection and the Gen2
ECL tag alone do not identify Secret. Unknown/duplicate profiles and
foreign `/P` rosters are rejected. Task 236 adds the typed Secret party path
described below; without an owned roster or loose SAV selection, the
task-235 fixture party remains available for data-only probes.

The profile requires headerless 440-byte MONCHA records, sibling raw
MONITM/MONSPC libraries and a complete 2048-byte `ITEMS.DAT` catalogue.
The WHDLoad `DISK2` layout can read its catalogue from sibling `DISK1`
when the local catalogue is absent. An invalid existing local catalogue
fails instead of falling back. Container metadata, packet bounds, exact
output and whole-member auxiliary padding are checked before admission.
Auxiliary reads preserve the MONCHA archive in its independent DOS bank.

Normal HP/THAC0/AC and both attack kinds use source/equipment-derived
coefficients verified against Secret's own original routines. FIRE KNIFE
has current/max HP 52, THAC0 14, normal AC 6 (ready leather +2), inactive
primary and secondary rate 2 / 1d8+0. The profile uses Secret's byte-rate
parity, Pascal RNG transition and byte-wrapping normal damage prefix.
The original counter starts at zero, so native round 1 uses source parity
0 and round 2 uses parity 1, preserving the original byte overflow.
The native initiative, positioning and encounter flow remain Greybox's;
this is not an original encounter replay. Positional AC alternatives,
backstab, spells, transient/global effects, XP, morale and saving throws
are outside this normal-melee claim. Task 235 verification on 2026-10-10:
915 focused checks, 20 isolated real-route cases, 44/44 flows, 46/46
components and 7520 corpus tests passed (14 skipped), exit 0. Both sweep
artifacts bind canonical source hash
`8ed5200ea729049eeb4cc82ce738cd6d8195c1ebb994d417201f2bf0cb952b81`.
Capacity: GBBOOT 56739 emitted / 56995 resident / 8285 free;
CCCOMBAT 37952 / 38208 / 27072. These are task-235 historical measurements.

Secret owned party and HP persistence (task 236, verified 2026-10-10):

`CCPARTY /S C:\HEROES.GBP` explicitly imports all six `CHRDATA1..6.SAV`
files from the working directory. It preserves each complete 439-byte body
and independently owned STF67/SFX9 companions. Type73 children stay owned
without becoming equipped main items. The catalogue is exactly 2048 bytes;
only true local absence permits `..\DISK1\ITEMS.DAT`. Existing malformed
local input rejects. GBPR3 has title4/schema1, flags2 and 440-byte rows
(source slot plus body); its GBSA1 trailer owns the catalogue and companions.
Subsequent calls load the owned roster without reading retail source files.
Pending GSJ/GSB files require transaction recovery before standalone import.

Ordinary `GBBOOT /E /X /A 16 /@ 33930 /9 1` chooses this party when an
owned roster or any loose source SAV exists. Partial selections and foreign
rosters reject. It forwards the verified count and `/P` to combat. CCECL
receives `/ID4` without a foreign 410-byte `/B` roster; Secret WHO is an
explicit unsupported-opcode halt; cold WHO menu answers reject before their
one-time tokens are consumed.

Combat reconstructs normal class/equipment coefficients before the later
pre-combat recalculation, preserving current437 and max112 separately.
The six held heroes have HP95/74/91/58/78/35, THAC0 10/11/12/13/16/18,
AC6/6/7/7/6/7, primary rates3/3/3/3/2/2 and 1d2 bonuses6/3/3/3/0/1.
Zero HP stays down. Imported player attacks use Secret phase0 and byte damage;
their carried primary turn budget is retained across Move/Quick.

Secret GBCR3 appends the complete precombat roster to bind its HP receipt.
GBHR2/mode4 invokes dedicated CCHOST HP-only publication: GSJ records exact
request/result/preimage, GSN stages the whole postimage, and GSB retains the
preimage across DOS renames. Recovery compares complete images; consumption
and cleanup finish before GSJ is removed. Boot recovers before interpreting
a temporarily missing roster as permission to import. Only owned current-HP
bytes change; original SAV/STF/SFX/catalogue inputs remain read-only.
Mismatched preimages/results and consumed replay reject. This is process
interruption recovery under working DOS storage, not arbitrary power-loss
protection. Reintroducing an old unconsumed result with a byte-identical
preimage has no generation token and is outside the replay guarantee.

Explicit SAV import does not restore an original WHO-selected saved party.
XP, original condition/death transitions, effect execution, spell/special
mechanics, original movement and encounter positioning remain unsupported;
native zero-HP inactivity does not rewrite original status fields.
Implementation `557e5d26` passes 1,242 focused checks, the final Luna controls,
44/44 clean-source flows, 46/46 components and full corpus
(7,847 passed /14 skipped, exit 0). Both sweeps bind canonical source
`736d5e9db9d2bb62257d50033f6cc1627c6d9ad0443d240ce735246d78604821`.
No retail files changed. Exact evidence is in the handoff. Task237 separately
addresses completion before GSJ publication; current cold-start recovery
does not recognize an unconsumed result without its journal.

Completed Secret handoff protection (task 237, verified 2026-10-10):

Before launching owned Secret combat, GBBOOT writes the typed request and
calls `CCHOST /P <request> <expected-roster>`. GSC1 contains an eight-byte
header, the exact 346-byte request and the complete roster preimage; GSD
stages it and is closed/verified before publication. A prior unconsumed or
malformed result prevents a new launch. A validated consumed result matching
current postimage can be retired before preparing the next intent.

Cold startup checks GSC before import or ECL work and uses `/C` with the exact
expected target. GSC binds both result and any GSJ before HP mutation. The
existing transaction completes, consumes the result and removes GSC last.
If no result exists and P still equals the complete intent preimage, `/C`
retires the unstarted intent so ordinary startup can restart. Partial results,
foreign bindings and changed targets fail closed with evidence preserved.
Legacy unbound results are retained rather than assigned a new intent.
Journal-only `/S` and other titles retain their existing contracts.

The real-route standing test stops after result close and proves the next
combat's preimage is recovered P1. Final HP alone is insufficient because a
deterministic rerun from stale P0 can produce the same final values. The
pipeline settles HP before restarting normal ECL entry; it does not restore
the original encounter continuation, original saves or arbitrary stale-copy
freshness. Exact process-interruption scope and final gates are in the handoff.

Implementation `608fb96c` passes 1,257 focused checks and final Luna controls,
44/44 clean-source flows, 46/46 components and full corpus
(7,862 passed /14 skipped, exit 0). The reliable flow recheck captures actual
exit 0 after the first monitor lost that field. Both sweeps bind canonical source
`f0850457f661d9bc24a4a7db3b82a804189ecd566d5855521b7a2d7aaed7f25f`.
No retail files changed. Diagnostic stream limitations and exact evidence are
recorded in the current handoff.
