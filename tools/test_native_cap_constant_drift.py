"""Mechanical guard: a `native/*.ps1` pin holding a SUPERSEDED value of a
`native/src/*.asm` cap constant, or sitting exactly ON its current value.

WHY THIS EXISTS
=========================================================================
An `equ` constant changes in `native/src/*.asm`; the `.ps1` pins that carry
the old value get updated; at least one is missed; nothing goes red, because
nothing gates the `$flowScripts` sweep. Documented instance:

CURRENT RUNTIME NOTE (2026-09-13)
=========================================================================
The historical analysis below describes the old saturation behavior. CCECL now
halts before decoding a recordable 65th effect, writes `GBHD reason=7`, and
preserves the unconsumed PC/opcode plus VM state. This guard still reports
historical stale pins and exact-cap candidates, but an exact-cap result is no
longer evidence that execution silently discarded the next host effect.

  * `cca0655` (2026-07-25) raised `SCRIPTCAP` 16 -> 32 in `ccecl.asm`,
    `ccefx.asm` and `ccfp.asm` and introduced `gbboot.asm`'s sibling
    `GBEF_SCRIPT_CAP equ 32`; `5871cc6` (2026-07-25, "native: retain 64
    attract script events") took both to 64 and updated pins in FIVE `.ps1`
    files. `native/gbcoab-flow-test.ps1` still pins `GBSX count=0010`. `0010`
    is HEX for 16, which is what `SCRIPTCAP` was when that pin was authored
    (`git show 23ba497:native/src/ccecl.asm` -> `SCRIPTCAP equ 16`). It is 64
    now and the engine emits `0037` = 55. That script is FAIL in
    `native/flow-status.json` on exactly this needle, today.

SAY WHAT THE FINGERPRINT IS *NOT*, BECAUSE THE MOTIVATING STORY OVERREACHED
=========================================================================
An adversarial review of this file's first draft (2026-09-10) killed three
claims that stood here, and they are recorded rather than deleted because
each was the kind of true-sounding framing this repo keeps getting caught by:

  * "`5871cc6` ... updated pins in four `.ps1` files -- but gbcoab still pins
    `GBSX count=0010`" read as *sibling COUNT pins were corrected and one was
    missed*. **`5871cc6` changed ZERO `GBSX count=` needles anywhere in the
    tree** -- verified: every `.ps1` hunk in it is a byte-offset or
    record-length change (3980->5708, 4022->5750, 2892->3532, 4004->5732).
    gbcoab's pin was stale from `cca0655` onward and no commit ever tried to
    fix it. The drift is real; "the siblings were fixed and this one was
    missed" was not the mechanism.
  * Two further incidents were cited as instances of this fingerprint and are
    NOT detectable here: `e3ce79f`'s monster-count pin is a retail data count
    with no `equ` behind it (`MONSTER id=`/`count=` is not one of the ten
    emitted `db '<TOKEN> <field>=',0` literals in `native/src`), and the
    round-37 `GBPS` version pin is not an `equ` cap either. The repo's own
    record also puts that version pin in `gbdqk-multistep-flow-test.ps1`
    ALONE (`docs/engine/PLAN-ROUND-37.md` C3; CLAUDE.md settles a documented
    dispute by showing `gbdqk-create-test.ps1` carries no version-1 pin at
    all), so "fixed one and missed two" had no two to miss.
  * A claimed precedent -- "this repo has explicitly rejected loosening a
    guard from 2 findings to 30 false ones" -- was RETRACTED HERE AS
    INVENTED, AND THAT RETRACTION WAS ITSELF WRONG. It is real and it is in
    `tools/`, which is why a `docs/`-and-plans sweep missed it:
    `tools/test_native_readme_subject.py:49-53` records the pin gate as
    "load-bearing and ... MEASURED, not assumed: removing it takes the live
    README from 2 findings to 30, and the sampled extras are tool OUTPUT
    values (`RowsWith4CE9Gate=0`, `CombatRows=1`) and command lines a scan is
    described as 'proving with', not needles any `.ps1` contains." That is
    exactly the precedent: a guard was KEPT rather than loosened, on a
    measured 2-vs-30 false-positive count. The PRINCIPLE below never depended
    on the anecdote -- but a false retraction costs the same as a false
    claim, and this one deleted a real, citable measurement. Sweep `tools/`
    too before declaring a repo precedent nonexistent.

Unlike the "true claim filed under the wrong SUBJECT" class -- which no gate
in this repo can catch -- this one IS mechanically detectable, and this file
detects it. It is pure static analysis over source text plus `git log`: it
never launches DOSBox, DOSBox-X or pwsh, so it is safe to run alongside
anything else and safe under `pnpm test:corpus`.

HOW THE LINK IS ESTABLISHED (this is the whole design)
=========================================================================
The hard part is not finding the number 16 in a `.ps1` file -- 16 is
everywhere. It is proving that a particular `16` is *the same 16* as a
particular constant. That link is derived from the assembler source in two
mechanical steps, never hand-asserted:

  1. EMITTED PREFIX. `native/src/*.asm` contains the literal the dumper
     prints, e.g. `native/src/ccefx.asm`:

         s_gbsx_count  db 'GBSX count=',0

     giving the exact needle prefix `GBSX count=` as a (token, field) pair.
     Measured 2026-09-10: 10 such prefixes exist.

  2. CAP ANNOTATION. `native/src/ccecl.asm`'s own record-format comment block
     names the magic and then, on a later line of the same block, names the
     constant that bounds the field:

         ;  2246 char[4] script magic "GBSX" (v4/v5/v6)
         ;  2250 u16     script side-effect count (max SCRIPTCAP = 64)

     A `max <CONST>` line is bound to the NEAREST PRECEDING `magic "<TOKEN>"`
     line in the same file, and the pair is kept only if (a) `<CONST>` is a
     real `equ` name and (b) some emitted prefix `(<TOKEN>, <field>)` exists
     whose `<field>` word also appears in the cap line.

Filter (b) is what makes this precise rather than broad. Without it the same
block's `max ENCCAP` and `max NPCCAP` lines bind to the preceding `GBEF`
magic, which the dumper never prints as `GBEF <field>=` at all. Measured
2026-09-10 over the real tree: this rule alone yields EXACTLY ONE
association, `GBSX count=` <-> `SCRIPTCAP`, and it is the correct one.

  3. DATAFLOW (added 2026-09-10; see `dataflow_cap_associations`). The rule
     above reads ENGLISH, and English is the weakest witness available here.
     The dumper's own code carries the link directly -- a register is compared
     against the cap, committed to a variable, and that SAME variable is what
     gets printed after the prefix literal:

         cmp     ax, ENCCAP
         ja      .bad
         mov     [enc_count], ax
         ...
         mov     dx, s_gbec_count      ; db 'GBEC groups=',0
         call    print_z
         mov     ax, [enc_count]
         call    print_hex_word

     Two peephole passes joined on the variable name. `cap_associations` is
     the UNION of rules 2 and 3, deduplicated on (token, field, constant),
     with the dataflow citation winning ties because a code fact outranks a
     comment.

WHAT THE COVERAGE SENTENCE USED TO SAY, AND WHY IT WAS FALSE
=========================================================================
Until 2026-09-10 this docstring stated, under "DELIBERATELY NOT COVERED":

    "Only `SCRIPTCAP` is associated with an emitted dump field, so only
     `SCRIPTCAP` can produce a finding."

That is a claim about the ASSEMBLER, and as a claim about the assembler it
is false. `GBEC groups=` and `GBNJ joins=` are both genuinely capped -- by
`ENCCAP` and `NPCCAP`, checked in `dump_handoff` (`ccefx.asm:303` and `:363`,
`cmp ax, <CAP>` / `ja .bad`) exactly as `GBSX count=` is checked in
`dump_gbsx` (`:552`). The accurate statement is narrower and is about THIS
FILE, not about the source:

    Only `SCRIPTCAP` survived the doc-comment rule's field-word filter.

Two mechanisms had to be got past, and the adversarial review that raised
this named only the second, so both are recorded rather than the one:

  * THE MAGIC BINDING, which is the primary blocker. `ccecl.asm`'s record
    block documents a BINARY layout whose only magic at that point is
    `GBEF` (`:5333`); `GBEC` and `GBNJ` are TEXT tokens invented by the
    dumper and appear in no `magic "..."` line anywhere. So `max ENCCAP`
    (`:5344`) and `max NPCCAP` (`:5346`) bind to `GBEF`, and the loop rejects
    on `token != current_magic[0]` before it ever reaches the field words.
    Widening the field-word filter alone would have fixed NOTHING.
  * THE FIELD-WORD MISMATCH, which is real but second in line: `:5344` says
    "queued encounter group count" -- `group`, not `groups` -- and `:5346`
    says "ADD_NPC join count" -- `join`, not `joins`.

The fix is neither of those. Loosening a filter to chase a wording is how a
precise guard becomes a broad one; the dataflow rule sidesteps both mechanisms
by not reading prose at all, and it finds all three pairs and nothing else.

REPORT THE NULL WITH THE FIX: IT ADDED ZERO FINDINGS TODAY
=========================================================================
Say this plainly rather than letting a widened coverage claim imply a catch.
Measured 2026-09-10 by `git log -p --unified=0` over `native/src/*.asm`:
`ENCCAP` and `NPCCAP` appear with a `+` side ONLY -- `+ENCCAP equ 8` and
`+NPCCAP equ 8`, twice each (once for `ccecl.asm:190-191`, once for
`ccefx.asm:25-26`) -- and with NO `-` side at all. Neither constant has ever
changed value. Their superseded sets are therefore empty, and the live
census finds no pin on their current value either (26 `GBEC groups=` pins,
all 1 or 2; 2 `GBNJ joins=` pins, 1 and 3; cap is 8 for both).

So the false-negative class this fix closes is currently EMPTY. Findings
before the fix: 7 candidates / 6 unquarantined. After: 7 / 6, the same seven.
The fix is still correct -- it is what makes the next `ENCCAP` bump visible
instead of silent -- but it caught nothing today, and a guard that widens its
coverage is exactly where this repo has previously let a widened denominator
read as an improvement.

THE FALSE POSITIVE THIS RULE MUST NOT MAKE
=========================================================================
`native/ccefx-test.ps1` also pins `GBSX count=0010`, and it is CORRECT: that
script BUILDS its own `SCRIPT.EFX` payload with exactly sixteen events and
then dumps it, so sixteen is what it fed in and the cap never bound it. It is
listed in `SELF_AUTHORED_PINS` below, by (script, needle), with that reason.

RETRACTED 2026-09-10, same day, by adversarial review -- and the retraction
is the useful part. The first draft suppressed that pin with a DERIVED rule:
"the script pins record index `#<V-1>` beside the count, so V is its own
expectation." **That rule is inverted.** A dump of V records prints indices
`#00`..`#(V-1)` whether V is a real count OR a cap ceiling, so
`max(index)+1 == V` is precisely the signature of cap TRUNCATION -- the rule
treated the strongest evidence FOR drift as proof against it. Demonstrated on
the real tree: leaving `GBSX count=0010` untouched and changing only WHICH
record `gbboot-test.ps1:4573` happens to pin (`#09` -> `#0F`) made that
finding vanish, though CLAUDE.md independently records the engine emitting 38
events there. Whether the guard fired depended on the pin author's choice of
subset, not on any evidence about the count.

So the derived rule is gone and the exception is now an explicit, hand-
curated, two-sided allowlist. That is a downgrade in elegance and an upgrade
in honesty: a hand-curated exception that says it is hand-curated cannot
quietly hide a finding the way a plausible-looking derived rule did for the
length of one review. A new self-authored fixture elsewhere will produce a
false positive until it is listed -- loud, which is the right direction.

Precision still comes first here: a small number of exact findings beats a
broad net, because a guard that cries wolf trains everyone to ignore it, and
this repo has several checks that went green while being structurally
incapable of failing.

WHAT THE SIX LIVE FINDINGS ACTUALLY ARE: A CLAMPED COUNT, NOT A STALE CAP
=========================================================================
This file was written and named as if the defect were *a pin carrying an old
constant*. That framing is one level too shallow, and correcting it is worth
more than any of the six findings, because it is an instance of this repo's
own standing lesson from `goldbox-verify-gaps-against-binary`: **a constant a
parser hard-requires is usually a field.** `SCRIPTCAP` is not decoration
around the count -- it IS the count, whenever there were more events than the
array holds.

Verified 2026-09-10 by reading `native/src/ccecl.asm` and `ccefx.asm`:

  * `fx_script_count` is a SATURATING counter. It is written in exactly two
    ways -- zeroed once (`ccecl.asm:1528`) and `inc`'d (`:4376`, `:4409`,
    `:4502`, `:4530`, `:4581`, `:4679`). There is no `dec` and no
    `mov [fx_script_count], SCRIPTCAP` anywhere. It is also the record field
    itself: it is declared inside the GBEF image at `:6718`, immediately
    after `fx_script_magic db 'GBSX'` at `:6717`, so there is no copy-out
    step in which a clamp could hide.
  * SIX producer sites guard the append with `cmp ax, SCRIPTCAP` / `jae`, and
    in every one the `inc` is INSIDE the guarded region -- e.g.
    `record_call_event` jumps from `:4394` to `.ret` at `:4411`, past the
    `inc` at `:4409`, and `op_script_effect` jumps forward from `:4541` to
    `.skip` at `:4586`, past the `inc` at `:4581`. So at the cap the counter
    stops advancing rather than counting past a skipped store.
    (The brief that prompted this correction said NINE producer sites. That
    is wrong and is recorded rather than quietly fixed: there are seven
    `cmp ax, SCRIPTCAP` / `jae` guards, one of which -- `record_operand_text`,
    `:4706-4708` -- writes only the v6 text slot and never increments, plus
    two `cmp bx, 0ffffh` sentinel guards at `:4449` and `:4473` that are not
    `SCRIPTCAP` comparisons and not producers. Six, seven or nine depending
    on the denominator; the producer count is SIX.)
  * `dump_gbsx` VALIDATES rather than clamps: `cmp ax, SCRIPTCAP` / `ja .bad`
    (`ccefx.asm:552-553`), storing the value unmodified. `ja`, not `jae`, so
    exactly-cap is accepted -- which is precisely the saturation value.

Therefore the printed word is `min(real_events, SCRIPTCAP)`.

  * AND THE TRUNCATION IS SILENT. There is no halt reason for it
    (`ccecl.asm:181-187` has `HALT_MEM_FULL` for the sparse-memory table
    filling up but nothing for the script array -- the asymmetry is the
    finding), no flag bit (`fx_flags`, `:173-180`, is fully allocated to
    presence bits; at the cap `FX_HAVE_SCRIPT` is simply not re-OR'd, which
    is indistinguishable from any normal non-appending step), no record field
    between offsets 2250 and 2252, and no emitted marker. A saturated 64
    renders as `GBSX count=0040` and is byte-for-byte identical to a genuine
    64-event trace.

Two of the six findings already have observed values far above every value
`SCRIPTCAP` has ever held, which is what a clamp looks like from outside:
CLAUDE.md records DQK `/A 66` producing 38-event transcripts (`0026`) and
CoAB `/B 51` emitting `0037` = 55 against the pinned `0010` = 16.

So the six pins are not "a constant that moved". They are almost certainly
traces that were cut off at 16 and written down as if 16 were the answer. The
replacement values must come from measured DOSBox runs; this file does not
guess them and must not be edited to raise them.

PRESENT-TENSE TRUNCATION -- THE SHARPEST DEFECT THIS FILE HAD
=========================================================================
Follow the paragraph above to its conclusion and the first draft's blind spot
is obvious. If the printed word is `min(real_events, cap)`, then the single
most suspicious value a pin can hold is the cap ITSELF -- and until
2026-09-10 this file passed that value in silence, because it only ever
looked for SUPERSEDED cap values. `GBSX count=0040` today, `GBSX count=0010`
in July: a count sitting exactly on its own ceiling, with no overflow signal
anywhere in the format to say whether it is a full trace or a cut one.

The historical cost is measurable. A check of this shape would have gone red
on 2026-07-15, the day the six offending pins were authored, because
`SCRIPTCAP` was 16 then and every one of them sat exactly on it. The drift
check cannot see them until the constant moves; it took 57 days and two
bumps (16 -> 32 -> 64) for that to happen. Present tense catches this class
at authoring time; superseded tense catches it at the next bump, if there
ever is one -- and for `ENCCAP` and `NPCCAP` there never has been.

`test_no_pin_sits_exactly_on_the_current_cap` is the companion assertion. It
shares `scan_script_text`, `SELF_AUTHORED_PINS` and `QUARANTINE` with the
drift check -- one scanner, one exemption surface -- because a script that
AUTHORS a payload of exactly cap-many records pins the ceiling legitimately,
and the two checks must not drift apart in their parsing or their excuses.
Sharing the allowlist is safe because a needle embeds its own value: if a
pin's value changes, its key changes, so the entry goes stale and
`test_exception_lists_have_no_stale_entries` fires.

MEASURED LIVE FINDING COUNT FOR THE CEILING CHECK: ZERO, on 2026-09-10.
Reported as a zero rather than dressed up as a catch. Census over 96
`native/*.ps1`, whole-line comments excluded: 59 `GBSX count=` pins with zero
at `0040` and zero at `0020`; 26 `GBEC groups=` pins, zero at 8; 2
`GBNJ joins=` pins, zero at 8.

THE FALSE POSITIVE THIS INSTRUMENT CANNOT RULE OUT
=========================================================================
Stated as a CLASS, because the section above states only its converse -- the
one false positive the rule must not MAKE (`ccefx-test.ps1`, self-authored)
-- and a single named instance reads as an exhaustive list.

THE CLASS: a genuine count that merely HAPPENS to equal a cap value is
indistinguishable, from static text alone, from a count that was clamped to
it. This instrument establishes CANDIDACY, never a verdict, and the failure
messages say so; they used to read "a SUPERSEDED value of X", which is a
verdict the evidence does not support.

It is a live surface, not a theoretical one. The cap values in play are 16,
32, 8 and 8 -- all small integers that a real trace could plausibly hit. The
`ENCCAP`/`NPCCAP` census is the clearest case: 17 pins at `groups=0001` and
9 at `groups=0002` are obviously real counts, and had the cap been 1 or 2 the
instrument would have flagged every one of them with no way to tell.

WHAT MAKES TODAY'S SIX MORE THAN A COINCIDENCE, stated as evidence and not as
proof: the distribution has a saturation signature. Across the 59 `GBSX
count=` pins the values are {0:16, 1:11, 2:7, 3:4, 4:3, 5:4, 6:1, 7:4, 10:2,
16:7} -- a corpus that decays smoothly and, apart from the atom at 16, tops
out at 10, with NOTHING in 11..15 and nothing above 16. (8 and 9 are empty
too, which the census that produced this figure noted and which is worth
carrying: the empty region is really 8..15 with a lone 10 inside it.) An atom
of 7 pins sitting exactly on an old ceiling, with a hole immediately beneath
it, is what clamping looks like and is not what an organic count distribution
looks like. It is still a distributional argument. Only a DOSBox run settles
any individual pin.

WHAT IS DELIBERATELY *NOT* CHECKED, AND WHY IT WOULD BE TAUTOLOGICAL
=========================================================================
It is tempting to assert that a pinned `GBSX count=NNNN` agrees with the
number of `#NN OP=` record lines pinned beside it. **That check can never
fail as a value check**, and adding it would be one more entry on this
repo's list of assertions that are structurally incapable of going red.
`dump_gbsx`'s event loop is bounded by the count itself
(`ccefx.asm:584-588`: `mov ax,[event_idx]` / `cmp ax,[script_count]` /
`jae .done`), so a dump of a truncated count prints exactly that many lines.
Count and line-count agree by construction, whether or not the count is real.

Worth noting because it is a DIFFERENT and genuine defect: comparing the
pinned INDICES against their positions would catch an index SHIFT (a dump
that starts at `#01`, or skips a record). That is worth building. It is not
this check, and conflating the two would let a tautology inherit a real
check's credibility.

DELIBERATELY NOT COVERED (say the limit, do not imply coverage)
=========================================================================
* Constants that neither rule can reach. Four `equ` constants in
  `native/src/*.asm` have changed value over the repo's history:
  `SCRIPTCAP` (16 -> 32 -> 64), `GBEF_SCRIPT_CAP` (32 -> 64),
  `C_REC` (26 -> 38) and `FXMAX` (4096 -> 8192). Of those four only
  `SCRIPTCAP` reaches an emitted dump field, so only `SCRIPTCAP` can produce
  a SUPERSEDED finding; the other three are invisible to this guard.
  CORRECTED 2026-09-10: this bullet used to end "Only `SCRIPTCAP` is
  associated with an emitted dump field, so only `SCRIPTCAP` can produce a
  finding" -- a claim about the assembler, and false there. See "WHAT THE
  COVERAGE SENTENCE USED TO SAY" above; `ENCCAP` and `NPCCAP` are associated
  too, they simply have no history to be superseded from, and they DO
  contribute to the ceiling check.
* A hard-coded numeral inside a cap COMMENT. `ccecl.asm:5359` reads
  "(max SCRIPTCAP = 64)" while `:5344` and `:5346` read "max ENCCAP emitted"
  / "max NPCCAP emitted" with no numeral. That `64` is a second copy of the
  constant living in prose, and it can drift from `ccecl.asm:192` exactly the
  way a `.ps1` pin can. It is not checked here -- this guard's subject is
  `.ps1` pins -- and its null is that the two agree today (both 64). Noted so
  the next reader does not assume the comment was verified.
* DERIVED lengths. `5871cc6`'s edit to `native/gbbuck-flow-test.ps1` was not
  a count at all -- it was a record-length pin, `4022 -> 5750`, because
  `FX_V6_LEN` is an `equ` EXPRESSION over `SCRIPTCAP`
  (5750 - 4022 = 1728 = 32 * 54 = 32 * (SCRIPT_REC_BYTES 20 +
  SCRIPT_TEXT_REC_BYTES 34)). This guard only reads NUMERIC `equ` values and
  so cannot follow that. Measured before deciding to skip it, because a
  skipped class needs its null: `ccefx-test.ps1`'s `$GbefLength` went
  `3158` (born `23ba497`, cap 16) -> `4022` (`a88eeb2`, cap 32) -> `5750`
  (`5871cc6`, cap 64), and grepping `native/*.ps1` for BOTH superseded
  lengths `3158` and `4022` on 2026-09-10 returns ZERO hits -- every length
  pin in the tree is the current `5750`. The class is real but currently
  empty, which is why extending to it was not worth the false-positive
  surface. (The first draft named `2294` as the cap-16 length. That is
  5750 - 64*54, the cap-ZERO base; it was never a pinned length in this tree,
  so the null as originally stated tested nothing. Caught by review, and
  re-measured above rather than patched.)
* Same-name `equ` constants that DISAGREE across files. Four exist today --
  `DAXTOC_ENTRIES` (128 in ccecl.asm, 64 in ccgeo.asm), `DAX_FILEMAX`
  (32768 / 60000), `PARTY_MEMBER_AFFECT_MAX` (8 / 4) and
  `PARTY_MEMBER_SPELL_MAX` (16 / 4) -- so this is the norm, not an edge case.
  A cross-file union of values would report one file's CURRENT value as
  another file's SUPERSEDED value: a false-positive engine. The first draft
  merely `continue`d past such a constant, which would have disabled the
  guard silently at exactly the moment a disagreement appeared. It now FAILS
  loudly instead -- see `test_associated_constants_agree_across_files`.
* Values that a constant never held. A pin can be wrong for reasons that have
  nothing to do with a cap; this guard is silent about all of them.
* Whether a flagged pin's CORRECT replacement value is. That can only come
  from a real DOSBox run. Flagging is the whole deliverable here.

WHAT TURNS THIS RED, AND WHY THAT IS THE POINT
=========================================================================
Two independent assertions, over the same candidate stream:

  * SUPERSEDED (`test_no_unquarantined_cap_constant_drift`) -- a pin holding
    a value the associated cap held earlier and does not hold now. RED on
    HEAD 2026-09-10 on SIX findings: `gbboot-test.ps1` lines 4573, 5041,
    5044, 5046 and 5097, and `gbcoab-flow-test.ps1:271`, all pinning
    `GBSX count=0010` against `SCRIPTCAP` = 64. A seventh candidate,
    `ccefx-test.ps1:206`, is excused by `SELF_AUTHORED_PINS`.
  * CEILING (`test_no_pin_sits_exactly_on_the_current_cap`) -- a pin holding
    the cap's CURRENT value, i.e. the printed form of a silent truncation.
    ZERO findings on HEAD 2026-09-10, measured, not assumed.

Both are red only for pins not listed in `SELF_AUTHORED_PINS` or
`QUARANTINE`. Six findings is the guard working, not the guard misfiring;
zero is a real zero and is reported as one. See `QUARANTINE`'s docstring for
the two legitimate ways to make either green.

PROOF THAT IT CAN FAIL
=========================================================================
Required by this repo's hardest rule: several "green" checks here turned out
to be structurally incapable of failing. `SyntheticRuleTests` drives the rule
over hand-written fixtures in both directions; `HistoricalReplayTests` replays
it against the REAL scripts. Mutation-tested 2026-09-10, four ways, each
restored from a byte-exact backup and re-verified by SHA-256 (never
`git checkout --`):

  1. SUPERSEDED AND INVERTED 2026-09-10, in the same session that wrote it.
     It read: "`native/gbcoab-flow-test.ps1` pin -> `GBSX count=0037`:
     `test_live_scan_replays_the_known_bad_gbcoab_pin` fails, 'the known-bad
     gbcoab pin no longer fires'." Both halves are now dead. That mutation
     IS the repo's real state -- the pin was re-measured in DOSBox and is
     0x0037 (55) -- and the test it names no longer exists, because a
     detection proof that asserts the defect is STILL PRESENT cannot survive
     the defect being fixed. The proof moved to frozen text
     (`test_fixture_replays_the_historical_gbcoab_pin`), and the live half
     inverted into a regression guard. Re-run in the new direction:
     `native/gbcoab-flow-test.ps1` pin `GBSX count=0037` -> `GBSX count=0010`,
     i.e. reintroducing the 2026-07-15 clamped value: 2 red,
     `test_live_gbcoab_pin_is_fixed_and_stays_fixed` and
     `test_no_unquarantined_cap_constant_drift`. Restored from a byte-exact
     backup, SHA-256 re-verified.
  2. `native/gbbuck-flow-test.ps1` pin -> `GBSX count=0010`:
     `test_live_scan_control_gbbuck_does_not_fire` fails.
  3. `native/ccefx-test.ps1` pin -> `GBSX count=0037`:
     `test_exception_lists_have_no_stale_entries` fails -- the allowlist entry
     stops matching a candidate, so an exception cannot outlive its subject.
  4. `unquarantined`'s `f.key not in excused` -> `f.key in excused`, i.e. the
     exception logic inverted: red. This one matters because in the FIRST
     draft that same mutation hid all six findings while all 19 tests passed,
     since the live assertion filtered inline and the synthetic test
     re-implemented the filter and agreed with itself. Extracting one
     `unquarantined` used by both closed it. A synthetic test that
     re-implements the code it checks is testing nothing. RE-RUN 2026-09-10
     after the ceiling work: still red, now on 5 tests.

  5. `native/gbboot-test.ps1`'s `-GbsxSaturated $true` -> a bare positional
     `$true`, i.e. the saturation declaration removed while the pin stays:
     3 red -- `test_live_saturated_coab_pin_is_excused_only_by_its_own_guard`,
     `test_no_pin_sits_exactly_on_the_current_cap` and
     `test_the_saturation_excuse_is_derived_not_declared_in_python`. This is
     the load-bearing proof that the third disposition is DERIVED: delete the
     guard and the ceiling pin goes red again, with nothing in Python to
     update. Restored byte-exact, SHA-256 re-verified.
  6. THE NULL for 5, because a guard that fires on everything discriminates
     nothing: `native/gbboot-test.ps1`'s unrelated area-66 pin
     `GBSX count=0026` -> `GBSX count=0029`, a value `SCRIPTCAP` has never
     held: 39 passed, 0 failed. The ceiling rule stays silent on a pin that
     is neither on the cap nor on a superseded value. Restored byte-exact.

RE-PROVED 2026-09-10 FOR THE THREE HARDENING CHANGES
=========================================================================
The ceiling check and the dataflow association are new assertions, so they
owe their own can-it-fail evidence rather than inheriting the above.

INPUT MUTATIONS, driven through the real `live_findings` / `scan_plan`
production path -- NOT through fixtures -- against a synthetic repository
built in a temp directory (one real copy of `ccefx.asm`, committed once with
`SCRIPTCAP equ 16` and again with `equ 64` so the constant has a genuine
`git log` history). Done this way on purpose: a full flow sweep was in
flight over `native/`, and mutating a real `.ps1` even briefly could have
corrupted it. Nothing under `native/` was written at any point.

     probe `.ps1` content        -> CEILING / SUPERSEDED
     'GBSX count=0003',
     'GBEC groups=0002',         -> 0 / 0    (control: neither fires)
     'GBSX count=0040',          -> 1 / 0    (ceiling, SCRIPTCAP)
     'GBSX count=0010',          -> 0 / 1    (drift, SCRIPTCAP)
     'GBEC groups=0008',         -> 1 / 0    (ceiling, ENCCAP -- a constant
                                              with NO history at all)
     'GBNJ joins=0008',          -> 1 / 0    (ceiling, NPCCAP)
     #  'GBSX count=0040',       -> 0 / 0    (comment lines still excluded)

  The ENCCAP and NPCCAP rows are the ones that matter: they are the live
  proof that the defect-1 fix is wired, since neither can ever produce a
  SUPERSEDED finding and so neither is visible in any drift count.

  Exemption, on the same path: adding the ceiling finding's (script, needle)
  to a `SELF_AUTHORED_PINS`-shaped map takes the red set 1 -> 0, and a map
  keyed on a DIFFERENT script reports that key stale. Both sides.

SOURCE MUTATIONS, each applied to this file, measured, then restored from a
byte-exact copy and re-verified by SHA-256 (`5c804ef0...`; never
`git checkout --`, which destroyed a round's work in this repo on 2026-09-05):

  5. `if value == current_value: kind = KIND_CEILING` -> `continue`, i.e. the
     first draft's blindness restored: 6 red (4 synthetic, 2 live).
  6. `if not superseded: continue` re-added to `scan_plan`: 2 red, including
     `test_the_live_scan_plan_covers_all_three_associations`. Worth its own
     line -- this mutation changes NO finding count anywhere, because all
     three associations contribute zero ceiling findings today, so only an
     assertion about what gets SCANNED can see it.
  7. `cap_associations` reduced to the doc-comment rule alone, i.e. defect 1
     reverted: 4 red.
"""
from __future__ import annotations

import datetime
import re
import subprocess
import unittest
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple

REPO_ROOT = Path(__file__).resolve().parents[1]
NATIVE = REPO_ROOT / "native"
NATIVE_SRC = NATIVE / "src"

# ---------------------------------------------------------------------------
# QUARANTINE
# ---------------------------------------------------------------------------
#: Findings that are known, accepted and NOT yet fixable here. Keyed by
#: (script file name, exact needle text) -- NEVER by line number. Line numbers
#: rot: this repo has watched `gbboot.asm:6586`, `ccfp.asm:298`,
#: `ccfp.asm:5287` and `native/README.md:147` each stop pointing at their own
#: subject, sometimes within the hour.
#:
#: A quarantine here must be LOUD, LISTED and TIME-BOXED, per CLAUDE.md's
#: precondition 1 for wiring a native runner into a standing gate: a silent
#: exclusion is how a vacuous check passes. Two-sided by construction --
#: `test_quarantine_has_no_stale_entries` fails if an entry stops matching a
#: live finding, so a quarantine cannot outlive the defect it covers.
#:
#: DELIBERATELY EMPTY on 2026-09-10. The six live findings are left RED rather
#: than pre-quarantined: their correct replacement values must come from a
#: real DOSBox run, which the round that wrote this guard was forbidden to do,
#: and quarantining a finding nobody has looked at yet would file the exposure
#: away before anyone saw it. Fill it in, or fix the pins.
#: Pins whose value the SCRIPT ITSELF authored, so the cap never bound them.
#: Keyed by (script file name, exact needle) -- never by line number.
#:
#: Hand-curated, and disclosed as hand-curated: the derived rule that used to
#: fill this in was inverted (see the module docstring). Two-sided --
#: `test_exception_lists_have_no_stale_entries` fails if an entry stops
#: matching a real candidate, so an entry cannot outlive its subject; and a
#: NEW self-authored fixture will be a loud false positive until listed here,
#: which is the correct direction for that error.
#:
#: SERVES BOTH CHECKS since 2026-09-10. A script that authors a payload of
#: exactly cap-many records pins the CEILING legitimately, for the identical
#: reason `ccefx-test.ps1` pins a superseded value legitimately, so one list
#: covers both rather than two lists drifting apart. That is safe because a
#: needle embeds its own value: change a pin and its key changes, the entry
#: stops matching, and the staleness test fires. Today every entry here is a
#: SUPERSEDED candidate; the ceiling side is exercised over fixtures by
#: `SyntheticRuleTests.test_a_ceiling_pin_is_excusable_and_the_excuse_is_two_sided`
#: and on the live path by mutation 4 in the module docstring.
SELF_AUTHORED_PINS: Dict[Tuple[str, str], str] = {
    ("ccefx-test.ps1", "GBSX count=0010"):
        "ccefx-test.ps1 BUILDS its own SCRIPT.EFX payload with exactly 16 "
        "events and then dumps it, so 16 is what it fed in and SCRIPTCAP "
        "never truncated anything. Note this is NOT justified by the sixteen "
        "'#00'..'#0F' needles beside it -- a cap-truncated dump prints those "
        "too. It is justified by the script authoring the input.",
}

QUARANTINE: Dict[Tuple[str, str], Dict[str, str]] = {
    # ("gbcoab-flow-test.ps1", "GBSX count=0010"): {
    #     "owner": "<name>",
    #     "expiry": "2026-10-10",
    #     "note": "why this cannot be fixed yet",
    # },
}

# ---------------------------------------------------------------------------
# Source extraction -- all pure functions over text, so the synthetic tests can
# drive them without touching the repo.
# ---------------------------------------------------------------------------

#: `NAME equ <number>`; only plain numeric values, never expressions.
_EQU_RE = re.compile(
    r"^[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]+equ[ \t]+([^;\r\n]+)", re.M
)
#: The dumper's own output literal, e.g. `s_gbsx_count db 'GBSX count=',0`.
_EMITTED_PREFIX_RE = re.compile(
    r"db\s+'([A-Z][A-Z0-9]{2,7}) ([a-z][a-zA-Z]*)=',\s*0"
)
#: A record-format comment naming a magic, e.g. `; 2246 char[4] ... magic "GBSX" ...`
_MAGIC_DOC_RE = re.compile(r'^\s*;.*\bmagic\s+"([A-Z][A-Z0-9]{2,7})"')
#: A record-format comment naming the cap, e.g. `; 2250 u16 ... (max SCRIPTCAP = 64)`
_CAP_DOC_RE = re.compile(r"^\s*;.*\bmax\s+([A-Z][A-Z0-9_]{3,})\b")
#: A `<TOKEN> <field>=HHHH` pin inside a PowerShell string literal.
_PIN_RE_TEMPLATE = r"\b{token} {field}=([0-9A-Fa-f]{{4}})\b"

# --- the DATAFLOW rule (added 2026-09-10; see "HOW THE LINK IS ESTABLISHED") --
#: The dumper's output literal WITH its label, e.g.
#: `s_gbsx_count  db 'GBSX count=',0` -> ("s_gbsx_count", "GBSX", "count").
_LABELLED_PREFIX_RE = re.compile(
    r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s+db\s+"
    r"'([A-Z][A-Z0-9]{2,7}) ([a-z][a-zA-Z]*)=',\s*0"
)
#: `cmp ax, SCRIPTCAP` -- a register compared against a named constant.
_CMP_CONST_RE = re.compile(
    r"^\s*cmp\s+([a-z]{2,3})\s*,\s*([A-Z][A-Z0-9_]{3,})\s*(?:;.*)?$"
)
#: `mov [script_count], ax` -- the checked register committed to a variable.
_STORE_VAR_RE = re.compile(
    r"^\s*mov\s+\[([A-Za-z_][A-Za-z0-9_]*)\]\s*,\s*([a-z]{2,3})\s*(?:;.*)?$"
)
#: `mov dx, s_gbsx_count` -- the prefix literal handed to `print_z`.
_LOAD_LABEL_RE = re.compile(
    r"^\s*mov\s+d?x\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:;.*)?$"
)
#: `mov ax, [script_count]` -- the value handed to `print_hex_word`.
_LOAD_VAR_RE = re.compile(
    r"^\s*mov\s+[a-z]{2}\s*,\s*\[([A-Za-z_][A-Za-z0-9_]*)\]\s*(?:;.*)?$"
)
#: How many following lines a `cmp`/`mov dx,` is allowed to reach for its
#: partner. Deliberately small: this is a peephole, not a dataflow engine, and
#: a wide window is how a peephole starts inventing links across routines.
_DATAFLOW_WINDOW = 8
# NOTE: two regexes lived at this point -- a per-record `#NN OP=` index
# matcher and a "line is one quoted literal" matcher -- serving the
# corroboration heuristic the module docstring retracts. Both are DELETED
# rather than left unused, because a dead matcher reads as wiring.


def parse_numeric_literal(text: str):
    """`64`, `0x40`, `40h` -> 64. Anything else (an expression) -> None."""
    m = re.fullmatch(r"(0x[0-9A-Fa-f]+|[0-9A-Fa-f]+h|[0-9]+)", text.strip())
    if not m:
        return None
    tok = m.group(1)
    if tok.lower().startswith("0x"):
        return int(tok, 16)
    if tok.lower().endswith("h"):
        return int(tok[:-1], 16)
    return int(tok, 10)


def parse_equ_constants(text: str) -> Dict[str, int]:
    out: Dict[str, int] = {}
    for name, raw in _EQU_RE.findall(text):
        value = parse_numeric_literal(raw)
        if value is not None:
            out[name] = value
    return out


def emitted_dump_prefixes(asm_texts: Dict[str, str]) -> set:
    """{(token, field)} for every `'<TOKEN> <field>='` the dumper prints."""
    found = set()
    for text in asm_texts.values():
        found |= set(_EMITTED_PREFIX_RE.findall(text))
    return found


@dataclass(frozen=True)
class Association:
    token: str
    field: str
    constant: str
    citation: str  # "<file>: magic line N -> cap line M"
    rule: str = "doc-comment"  # or "dataflow"

    @property
    def prefix(self) -> str:
        return f"{self.token} {self.field}="

    @property
    def triple(self) -> Tuple[str, str, str]:
        return (self.token, self.field, self.constant)


def doc_comment_cap_associations(asm_texts: Dict[str, str]) -> List[Association]:
    """Bind each `max <CONST>` doc line to its nearest preceding `magic "<T>"`
    doc line, keeping only pairs the dumper actually prints as `<T> <field>=`
    with `<field>` also named in the cap line. See the module docstring.
    """
    equ_names: set = set()
    for text in asm_texts.values():
        equ_names |= set(parse_equ_constants(text))
    prefixes = emitted_dump_prefixes(asm_texts)

    out: List[Association] = []
    seen: set = set()
    for fname, text in sorted(asm_texts.items()):
        current_magic = None
        for lineno, line in enumerate(text.splitlines(), 1):
            m = _MAGIC_DOC_RE.match(line)
            if m:
                current_magic = (m.group(1), lineno)
                continue
            c = _CAP_DOC_RE.match(line)
            if not c or current_magic is None:
                continue
            constant = c.group(1)
            if constant not in equ_names:
                continue
            words = set(re.findall(r"[a-z][a-zA-Z]*", line))
            for token, field in sorted(prefixes):
                if token != current_magic[0] or field not in words:
                    continue
                key = (token, field, constant)
                if key in seen:
                    continue
                seen.add(key)
                out.append(
                    Association(
                        token=token,
                        field=field,
                        constant=constant,
                        citation=(
                            f"{fname}: magic line {current_magic[1]} "
                            f"-> cap line {lineno}"
                        ),
                        rule="doc-comment",
                    )
                )
    return out


def dataflow_cap_associations(asm_texts: Dict[str, str]) -> List[Association]:
    """Bind an emitted prefix to a cap by following the VARIABLE between them.

    The dumper's own code is a far better witness than its comments, and this
    is the rule the doc-comment rule should always have been. In
    `native/src/ccefx.asm` each capped field is dumped as, verbatim:

        cmp     ax, ENCCAP          ; <- the cap bounds this register
        ja      .bad
        mov     [enc_count], ax     ; <- committed to this variable
        ...
        mov     dx, s_gbec_count    ; <- 's_gbec_count db 'GBEC groups=',0'
        call    print_z
        mov     ax, [enc_count]     ; <- the SAME variable is what gets printed
        call    print_hex_word

    So two peephole passes over each file, joined on the variable name:

      * CAPPED VARIABLES: `cmp <reg>, <CONST>` where `<CONST>` is a real `equ`
        name, followed within `_DATAFLOW_WINDOW` lines by `mov [<var>], <reg>`
        for the SAME register  ->  `<var>` is bounded by `<CONST>`.
      * PRINTED VARIABLES: `mov dx, <label>` where `<label>` declares
        `db '<TOKEN> <field>=',0`, followed within the same window by
        `mov <reg>, [<var>]`  ->  `<TOKEN> <field>=` prints `<var>`.

    Join the two on `<var>` and the association is a dataflow fact about the
    assembler, not a reading of English. Measured 2026-09-10 over the real
    tree: exactly three associations, all in `ccefx.asm`, and the
    discrimination is good in BOTH directions -- `resume_callsp`/`CALLCAP`,
    `resume_memcount`/`MAXMEM`, `resume_dump_count`/`RSMEM_DUMP_CAP` and
    `arg_left`/`SCRIPT_ARGS` are capped but never printed under one of the ten
    emitted prefixes, while `GBRS stack=` and `GBRS memdump=` print
    `resume_idx`, which is not capped. None of those seven produces an
    association, which is correct in every case.

    2026-09-23 (plan §32.3): the join above was flow-INSENSITIVE -- it
    matched a print site to ANY capped store of the same variable anywhere
    in the file, not the one that actually reaches it. `native/src/ccefx.asm`
    added `dump_gbsl` at `47a71bd8` (2026-09-14), and it reuses
    `[script_count]`: `dump_gbsx` caps it (`cmp ax, SCRIPTCAP` / `ja .bad` /
    `mov [script_count], ax`), but `dump_gbsl` stores an UNCAPPED count into
    the same variable at `:813` and prints it at `:841` -- the code says so
    in words (`:785-787`: "Its 16-bit count does not imply a memory cap"),
    and `native/ccefx-test.ps1:230` pins `GBSL count=0081` = 129, which is
    > 64 = `SCRIPTCAP`. The flow-insensitive join still found `SCRIPTCAP` in
    `capped['script_count']` and paired it with GBSL's print, producing a
    false `('GBSL', 'count', 'SCRIPTCAP')` association. The join is now
    reaching-definition aware: it finds, per print site, the TEXTUALLY
    NEAREST preceding store of the same variable (via `_STORE_VAR_RE`, over
    every store in the file, not only capped ones), and associates a cap
    only when that nearest store is itself one of the capped stores. GBSX's
    print at `:758` is reached by the capped store at `:732`; GBSL's print
    at `:841` is reached by the uncapped store at `:813`, which does not
    appear in `capped['script_count']` at all. This repeats the
    "measured 2026-09-10 ... exactly three" claim above, which the rule now
    keeps true rather than merely stating.
    """
    equ_names: set = set()
    for text in asm_texts.values():
        equ_names |= set(parse_equ_constants(text))

    out: List[Association] = []
    seen: set = set()
    for fname, text in sorted(asm_texts.items()):
        lines = text.splitlines()

        labelled: Dict[str, Tuple[str, str]] = {}
        for line in lines:
            m = _LABELLED_PREFIX_RE.match(line)
            if m:
                labelled[m.group(1)] = (m.group(2), m.group(3))
        if not labelled:
            continue

        # Every store site `mov [var], reg` in the file, capped or not --
        # this is what makes the join reaching-definition aware: a print's
        # association is decided by its NEAREST preceding store of the same
        # variable, not by every store of that variable anywhere in the file.
        all_stores: Dict[str, List[int]] = {}
        for i, line in enumerate(lines):
            s = _STORE_VAR_RE.match(line)
            if s:
                all_stores.setdefault(s.group(1), []).append(i + 1)

        # var -> {store lineno -> {(constant, cmp lineno)}}
        capped: Dict[str, Dict[int, set]] = {}
        for i, line in enumerate(lines):
            m = _CMP_CONST_RE.match(line)
            if not m or m.group(2) not in equ_names:
                continue
            reg, constant = m.group(1), m.group(2)
            for j in range(i + 1, min(i + 1 + _DATAFLOW_WINDOW, len(lines))):
                s = _STORE_VAR_RE.match(lines[j])
                if s and s.group(2) == reg:
                    capped.setdefault(s.group(1), {}).setdefault(
                        j + 1, set()
                    ).add((constant, i + 1))
                    break

        # (token, field) -> {(var, print lineno)}
        printed: Dict[Tuple[str, str], set] = {}
        for i, line in enumerate(lines):
            m = _LOAD_LABEL_RE.match(line)
            if not m or m.group(1) not in labelled:
                continue
            for j in range(i + 1, min(i + 1 + _DATAFLOW_WINDOW, len(lines))):
                v = _LOAD_VAR_RE.match(lines[j])
                if v:
                    printed.setdefault(labelled[m.group(1)], set()).add(
                        (v.group(1), j + 1)
                    )
                    break

        for (token, field), sites in sorted(printed.items()):
            for var, print_line in sorted(sites):
                # The nearest store of `var` that TEXTUALLY PRECEDES this
                # print is the one that actually reaches it; a store
                # anywhere else in the file (e.g. dump_gbsl's own, uncapped
                # `mov [script_count], ax`) must not vouch for a DIFFERENT
                # print site's cap.
                candidates = [
                    ln for ln in all_stores.get(var, ()) if ln < print_line
                ]
                if not candidates:
                    continue
                nearest_store = max(candidates)
                for constant, cmp_line in sorted(
                    capped.get(var, {}).get(nearest_store, ())
                ):
                    key = (token, field, constant)
                    if key in seen:
                        continue
                    seen.add(key)
                    out.append(
                        Association(
                            token=token, field=field, constant=constant,
                            citation=(
                                f"{fname}: cmp line {cmp_line} caps [{var}] "
                                f"-> printed at line {print_line}"
                            ),
                            rule="dataflow",
                        )
                    )
    return out


def cap_associations(asm_texts: Dict[str, str]) -> List[Association]:
    """Union of the two rules, deduplicated on (token, field, constant).

    The dataflow rule is listed FIRST so its citation wins on a tie: a code
    fact outranks a comment. `GBSX count=` <-> `SCRIPTCAP` is found by both,
    which is corroboration rather than duplication; `GBEC groups=` and
    `GBNJ joins=` are found only by the dataflow rule.
    """
    out: List[Association] = []
    seen: set = set()
    for assoc in (dataflow_cap_associations(asm_texts)
                  + doc_comment_cap_associations(asm_texts)):
        if assoc.triple in seen:
            continue
        seen.add(assoc.triple)
        out.append(assoc)
    return out


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------

def constant_value_history(constant: str, rel_paths: Sequence[str],
                           repo_root: Path = REPO_ROOT) -> set:
    """Every value `constant` has ever been assigned in `rel_paths`.

    One `git log -p` process rather than one `git show` per commit: the union
    of the `+` and `-` sides of every diff hunk that touched the `equ` line is
    exactly the set of values the constant ever held, including the one it was
    born with (which only ever appears on a `+` side). Cross-checked
    2026-09-10 against a per-commit `git show` walk over all 110 commits that
    touched `native/src`: both produce {16, 32, 64} for SCRIPTCAP.

    LIMIT, stated rather than implied: `--follow` is not used (it is invalid
    for multiple paths), so a value that only ever existed under a former file
    name is not seen.
    """
    proc = subprocess.run(
        ["git", "log", "-p", "--unified=0", "--format=%H", "--", *rel_paths],
        cwd=str(repo_root), capture_output=True, text=True,
        encoding="utf-8", errors="replace",
    )
    if proc.returncode != 0:
        raise RuntimeError(f"git log failed: {proc.stderr.strip()[:400]}")
    pat = re.compile(
        rf"^[+-]{re.escape(constant)}[ \t]+equ[ \t]+([^;\r\n]+)", re.M
    )
    values = set()
    for raw in pat.findall(proc.stdout):
        value = parse_numeric_literal(raw)
        if value is not None:
            values.add(value)
    return values


# ---------------------------------------------------------------------------
# The rule
# ---------------------------------------------------------------------------

#: A pin holding a value the cap USED to have. Candidate for the `5871cc6`
#: drift fingerprint -- or for a genuine count that coincides with it.
KIND_SUPERSEDED = "superseded"
#: A pin sitting exactly ON today's cap, i.e. the value a saturated (silently
#: truncated) trace prints. See "PRESENT-TENSE TRUNCATION" in the docstring.
KIND_CEILING = "ceiling"


@dataclass(frozen=True)
class Finding:
    script: str
    line: int
    needle: str
    constant: str
    pinned_value: int
    current_value: int
    citation: str
    kind: str = KIND_SUPERSEDED
    #: Set by `scan_script_text` when a CEILING pin's own call declares the
    #: trace saturated AND the script backs that with a cap-derived guard.
    #: Derived from the script text, never from a list here -- see
    #: `saturation_declared`.
    declared_saturated: bool = False

    @property
    def key(self) -> Tuple[str, str]:
        return (self.script, self.needle)

    def describe(self) -> str:
        where = (
            f"{self.script}:{self.line} pins '{self.needle}' "
            f"= {self.pinned_value} (0x{self.pinned_value:04X})"
        )
        if self.kind == KIND_CEILING:
            return (
                f"{where}, which is EXACTLY the current value of "
                f"{self.constant}. A count sitting on its own ceiling is what "
                f"a silently truncated trace prints, and what a genuine "
                f"exactly-full trace prints -- the two are byte-identical, so "
                f"this is a CANDIDATE for truncation, not a proof of it. "
                f"Resolve it by measuring the real event count, or list it in "
                f"SELF_AUTHORED_PINS if the script authored its own payload. "
                f"Association: {self.citation}."
            )
        return (
            f"{where}, a value {self.constant} held EARLIER but does not hold "
            f"now (it is {self.current_value} / 0x{self.current_value:04X}). "
            f"That makes this a CANDIDATE for the cap-drift fingerprint, not a "
            f"proven instance: a genuine count that merely coincides with a "
            f"superseded cap is indistinguishable from a clamped one. "
            f"Association: {self.citation}."
        )


#: A saturation declaration at a call site, e.g. `-GbsxSaturated $true`.
#: Passed BY NAME on purpose: a bare trailing positional `$true` cannot be
#: told apart from another bool parameter, and this repo already has
#: `Invoke-DqkEngineSmoke` calls ending in `$true` for unrelated reasons.
#: The captured prefix is matched against the association's TOKEN, so a
#: `-GbecSaturated` cannot excuse a `GBSX` pin -- the declaration is bound to
#: its subject, which is the failure mode a plain allowlist cannot catch.
_SATURATION_DECL_RE = re.compile(r"-([A-Za-z][A-Za-z0-9]*)Saturated\s+\$true\b")


def saturation_declared(line: str, text: str, association: Association) -> bool:
    """Is this CEILING pin's line an explicit, cap-derived saturation record?

    THE THIRD DISPOSITION, added 2026-09-10. The ceiling rule originally
    offered two ways out: measure the real count, or list the pin in
    `SELF_AUTHORED_PINS`. A real case fits NEITHER. CoAB `/A 4 /B 34` was
    measured, and the measurement is that the trace saturates: it prints
    `GBSX count=0040` with `SCRIPTCAP` at 64, so the real total is unknown
    and >= 64 and cannot be recovered without raising the cap and rebuilding.
    The script does not author its payload either, so `SELF_AUTHORED_PINS`
    would have filed a FALSE reason against it.

    So the pin is legitimate as a record OF THE CEILING rather than of a
    count, and what makes that safe is the guard beside it: an assertion that
    parses the cap out of the assembler and demands equality, so raising the
    cap turns the case RED and forces a re-measurement instead of quietly
    passing at `64 < 128`.

    Both halves are required, and both are read out of the script:
      1. the pin's own call carries `-<Token>Saturated $true`, and
      2. the script names the cap CONSTANT somewhere, i.e. the guard derives
         the ceiling from source rather than hard-coding today's number.

    A declaration with no cap reference is a comment, not a guard, and is
    refused. Nothing about this lives in a Python list, so the excuse cannot
    outlive its subject: delete the guard and the pin goes red again.
    """
    m = _SATURATION_DECL_RE.search(line)
    if not m:
        return False
    if m.group(1).upper() != association.token.upper():
        return False
    return association.constant in text


def scan_script_text(script_name: str, text: str,
                     association: Association,
                     current_value: int,
                     superseded: Iterable[int]) -> List[Finding]:
    """Every candidate pin in one script, of BOTH kinds.

    One scanner for both checks on purpose: the comment-line exclusion, the
    4-hex-digit pin grammar and the (token, field) prefix are shared, so the
    ceiling check cannot drift away from the drift check's parsing.
    """
    superseded = {v for v in superseded if v != current_value}
    pin_re = re.compile(
        _PIN_RE_TEMPLATE.format(
            token=re.escape(association.token), field=re.escape(association.field)
        )
    )
    lines = text.splitlines()
    findings: List[Finding] = []
    for i, line in enumerate(lines):
        if line.lstrip().startswith("#"):
            # A whole-line PowerShell comment. `gbdqk-multistep-flow-test.ps1`
            # carries a commented-out `# GBSX count=0002`; reporting prose as
            # a live pin would be a finding filed against nothing.
            continue
        for m in pin_re.finditer(line):
            value = int(m.group(1), 16)
            if value == current_value:
                kind = KIND_CEILING
            elif value in superseded:
                kind = KIND_SUPERSEDED
            else:
                continue
            findings.append(
                Finding(
                    script=script_name,
                    line=i + 1,
                    needle=m.group(0),
                    constant=association.constant,
                    pinned_value=value,
                    current_value=current_value,
                    citation=association.citation,
                    kind=kind,
                    declared_saturated=(
                        kind == KIND_CEILING
                        and saturation_declared(line, text, association)
                    ),
                )
            )
    return findings


def of_kind(findings: Sequence[Finding], kind: str) -> List[Finding]:
    return [f for f in findings if f.kind == kind]


def unquarantined(findings: Sequence[Finding],
                  quarantine: Dict[Tuple[str, str], Dict[str, str]],
                  self_authored: Dict[Tuple[str, str], str] = None) -> List[Finding]:
    """Candidate findings that must turn the gate red. Production path -- the
    synthetic tests drive THIS function, not a re-implementation of it, so
    they cannot pass by agreeing with themselves."""
    excused = set(quarantine) | set(self_authored or {})
    return [f for f in findings
            if f.key not in excused and not f.declared_saturated]


def stale_exception_keys(findings: Sequence[Finding],
                         *exception_maps) -> List[Tuple[str, str]]:
    """Entries in any exception map with no matching CANDIDATE finding. Both
    `SELF_AUTHORED_PINS` and `QUARANTINE` are two-sided through this: an entry
    that stops describing something real is a defect, because it would go on
    excusing a pin nobody re-checked."""
    live = {f.key for f in findings}
    keys: set = set()
    for m in exception_maps:
        keys |= set(m)
    return sorted(keys - live)


def quarantine_problems(quarantine: Dict[Tuple[str, str], Dict[str, str]],
                        today: datetime.date) -> List[str]:
    """Malformed or expired quarantine entries. Same production path as above,
    so the synthetic test that proves this can fire is testing the real code."""
    problems: List[str] = []
    for key, meta in sorted(quarantine.items()):
        for field in ("owner", "expiry", "note"):
            if not str(meta.get(field, "")).strip():
                problems.append(f"{key}: missing {field}")
        try:
            expiry = datetime.date.fromisoformat(str(meta.get("expiry", "")))
        except ValueError:
            problems.append(f"{key}: expiry is not an ISO date")
            continue
        if expiry < today:
            problems.append(f"{key}: quarantine EXPIRED on {expiry}")
    return problems


def load_asm_texts(src_dir: Path = NATIVE_SRC) -> Dict[str, str]:
    return {
        p.name: p.read_text(encoding="utf-8", errors="replace")
        for p in sorted(src_dir.glob("*.asm"))
    }


@dataclass(frozen=True)
class ScanTarget:
    """One association as it will actually be scanned: which constant, what
    value it holds now, which values it used to hold.

    Exposed as its own type so a test can assert WHAT GOT SCANNED, not only
    what was found. Every association currently contributes zero ceiling
    findings, so a regression that silently stopped scanning `ENCCAP` and
    `NPCCAP` -- re-adding the `if not superseded: continue` that used to sit
    in `live_findings`, say -- would leave the finding counts completely
    unchanged and no assertion over findings could see it.
    """
    association: Association
    current_value: int
    superseded: frozenset


def scan_plan(repo_root: Path = REPO_ROOT) -> List[ScanTarget]:
    """Everything `live_findings` is about to scan, before it scans it."""
    asm_texts = load_asm_texts(repo_root / "native" / "src")
    plan: List[ScanTarget] = []
    for assoc in cap_associations(asm_texts):
        declaring = sorted(
            f"native/src/{name}"
            for name, text in asm_texts.items()
            if assoc.constant in parse_equ_constants(text)
        )
        if not declaring:
            continue
        current = {
            parse_equ_constants(asm_texts[Path(p).name])[assoc.constant]
            for p in declaring
        }
        if len(current) != 1:
            # Two files disagree on the constant's CURRENT value. The first
            # draft `continue`d here, which would have disabled the guard
            # silently at exactly the moment a disagreement appeared -- and
            # four same-name/different-value equ constants already exist in
            # this tree, so it is the norm, not an edge case. Raise instead;
            # `test_associated_constants_agree_across_files` reports it.
            raise ValueError(
                f"{assoc.constant} has disagreeing current values across "
                f"{declaring}: {sorted(current)}. A cross-file union of "
                f"histories would report one file's CURRENT value as "
                f"another's SUPERSEDED value, i.e. a false-positive engine. "
                f"Split the association per file before proceeding."
            )
        current_value = current.pop()
        history = constant_value_history(assoc.constant, declaring, repo_root)
        superseded = history - {current_value}
        # NO `if not superseded: continue` here. That early exit was correct
        # while this file only looked for SUPERSEDED values, and became a
        # silent hole the moment the ceiling check was added: `ENCCAP` and
        # `NPCCAP` have never changed value, so their `superseded` set is
        # empty, and skipping them would have made the ceiling check apply to
        # SCRIPTCAP alone while the docstring claimed three associations.
        plan.append(ScanTarget(assoc, current_value, frozenset(superseded)))
    return plan


def live_findings(repo_root: Path = REPO_ROOT) -> List[Finding]:
    """Run the whole rule over the real tree. Requires git."""
    out: List[Finding] = []
    ps1_files = sorted((repo_root / "native").glob("*.ps1"))
    for target in scan_plan(repo_root):
        for ps1 in ps1_files:
            out.extend(
                scan_script_text(
                    ps1.name,
                    ps1.read_text(encoding="utf-8", errors="replace"),
                    target.association, target.current_value,
                    target.superseded,
                )
            )
    return out


# ===========================================================================
# ALWAYS-ON: the association really is derived from the assembler source.
# ===========================================================================
class AssociationTests(unittest.TestCase):
    def test_emitted_prefixes_are_found_in_the_real_asm(self) -> None:
        prefixes = emitted_dump_prefixes(load_asm_texts())
        self.assertIn(
            ("GBSX", "count"), prefixes,
            "native/src/ccefx.asm must still contain the dumper literal "
            "`db 'GBSX count=',0`. If it moved or was reworded, this guard's "
            "link between a .ps1 needle and an asm constant is gone and the "
            "whole file would pass vacuously.",
        )

    def test_the_real_tree_yields_the_three_dumper_associations(self) -> None:
        assocs = cap_associations(load_asm_texts())
        triples = sorted(a.triple for a in assocs)
        self.assertEqual(
            triples,
            [("GBEC", "groups", "ENCCAP"),
             ("GBNJ", "joins", "NPCCAP"),
             ("GBSX", "count", "SCRIPTCAP")],
            "Measured 2026-09-10: the union rule yields exactly three pairs "
            "over the real tree, all from `ccefx.asm`'s dumper. It was ONE "
            "until the dataflow rule was added the same day -- see the "
            "docstring's correction. If this list GREW again, that is fine "
            "and expected: update it and re-read the new findings. If it "
            "SHRANK, and especially if it went EMPTY, the guard covers less "
            "than its docstring claims, which must never be silent.",
        )

    def test_the_doc_comment_rule_still_independently_finds_scriptcap(self) -> None:
        """The doc-comment rule is deduplicated away by `cap_associations`
        (the dataflow rule finds the same pair first and its citation wins),
        so without this it could rot to nothing and no test would notice."""
        triples = sorted(a.triple
                         for a in doc_comment_cap_associations(load_asm_texts()))
        self.assertEqual(triples, [("GBSX", "count", "SCRIPTCAP")])

    def test_the_dataflow_rule_finds_all_three_and_nothing_else(self) -> None:
        assocs = dataflow_cap_associations(load_asm_texts())
        self.assertEqual(
            sorted(a.triple for a in assocs),
            [("GBEC", "groups", "ENCCAP"),
             ("GBNJ", "joins", "NPCCAP"),
             ("GBSX", "count", "SCRIPTCAP")],
        )
        self.assertTrue(all(a.rule == "dataflow" for a in assocs))

    def test_dataflow_rule_declines_capped_but_unprinted_and_printed_but_uncapped(
            self) -> None:
        """Both negative directions, over the REAL tree, because a peephole
        that says yes to everything is the failure mode here.

        Capped but never printed under an emitted prefix: `resume_callsp`
        (CALLCAP), `resume_memcount` (MAXMEM), `resume_dump_count`
        (RSMEM_DUMP_CAP), `arg_left` (SCRIPT_ARGS). Printed but not capped:
        `GBRS stack=` and `GBRS memdump=`, which both print `resume_idx`."""
        constants = {a.constant for a in dataflow_cap_associations(load_asm_texts())}
        for never in ("CALLCAP", "MAXMEM", "RSMEM_DUMP_CAP", "SCRIPT_ARGS"):
            self.assertNotIn(never, constants)
        tokens = {(a.token, a.field)
                  for a in dataflow_cap_associations(load_asm_texts())}
        self.assertNotIn(("GBRS", "stack"), tokens)
        self.assertNotIn(("GBRS", "memdump"), tokens)

    def test_expression_valued_equ_constants_are_not_mistaken_for_numbers(self) -> None:
        self.assertIsNone(parse_numeric_literal("SX_EVENTS_OFF + (SCRIPTCAP * 20)"))
        self.assertEqual(parse_numeric_literal("64"), 64)
        self.assertEqual(parse_numeric_literal("0x40"), 64)
        self.assertEqual(parse_numeric_literal("40h"), 64)


# ===========================================================================
# ALWAYS-ON: the rule can fire and can decline to fire, over fixtures.
# ===========================================================================
_ASSOC = Association("GBSX", "count", "SCRIPTCAP", "fixture.asm: magic 1 -> cap 2")

#: Verbatim shape of native/gbcoab-flow-test.ps1's block 51 needle array --
#: six pinned record indices (#00..#05) beside a count of 0x10 = 16.
GBCOAB_FIXTURE = """\
$dump = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=006F status=0003 geo=0033',
  'GBEC groups=0001',
  '@00 MONSTER id=0035 count=000E pic=0035',
  'GBSX count=0010',
  '#05 OP=2B HORIZONTAL_MENU ARGC=03 ARGS= 7F79 0001 001B',
  'TEXT=COMBAT'
)) {
  Assert-Contains $dump $needle 'GBBOOT Curse /B 51 effect dump'
}
"""

#: native/gbbuck-flow-test.ps1's pin -- 2 is not a value SCRIPTCAP ever held.
GBBUCK_FIXTURE = """\
foreach ($needle in @(
  'GBEF v0009 flags=0020 status=0000 geo=0003',
  'GBSX count=0002',
  '#01 OP=11 PRINT ARGC=01 ARGS= 0005'
)) { }
"""

#: native/ccefx-test.ps1's shape -- a synthesized 16-event input, so the
#: sixteen `#00`..`#0F` lines corroborate `count=0010` and it must NOT fire.
CCEFX_FIXTURE = "$needles = @(\n  \"GBSX count=0010\",\n" + "".join(
    f'  "#{i:02X} OP=11 PRINT ARGC=01 ARGS= 0005",\n' for i in range(16)
) + ")\n"


#: A miniature `ccefx.asm`, exercising the dataflow rule in BOTH directions in
#: one file: one fully-wired capped-and-printed field (`GBEC groups=` <->
#: ENCCAP), one capped variable that is never printed under an emitted prefix
#: (`callsp` <- CALLCAP), and one printed variable that is never capped
#: (`GBRS stack=` prints `walk_idx`). Only the first may associate.
DATAFLOW_ASM_FIXTURE = """\
ENCCAP      equ 8
CALLCAP     equ 32
dump_handoff:
        mov     ax, [fxbuf+FX_ENC_COUNT_OFF]
        cmp     ax, ENCCAP
        ja      .bad
        mov     [enc_count], ax
        mov     dx, s_gbec_count
        call    print_z
        mov     ax, [enc_count]
        call    print_hex_word
        mov     ax, [fxbuf+RS_CALLSP_OFF]
        cmp     ax, CALLCAP
        ja      .bad
        mov     [callsp], ax
        mov     dx, s_gbrs_stack
        call    print_z
        mov     ax, [walk_idx]
        call    print_hex_word
        ret
s_gbec_count  db 'GBEC groups=',0
s_gbrs_stack  db 'GBRS stack=',0
"""


class DataflowAssociationTests(unittest.TestCase):
    """The dataflow rule over a fixture, so it is proven able to say NO as
    well as YES without depending on the real tree staying as it is today."""

    def test_fixture_yields_only_the_capped_and_printed_field(self) -> None:
        assocs = dataflow_cap_associations({"fixture.asm": DATAFLOW_ASM_FIXTURE})
        self.assertEqual([a.triple for a in assocs],
                         [("GBEC", "groups", "ENCCAP")])
        self.assertIn("caps [enc_count]", assocs[0].citation)

    def test_a_capped_variable_that_is_never_printed_does_not_associate(self) -> None:
        assocs = dataflow_cap_associations({"fixture.asm": DATAFLOW_ASM_FIXTURE})
        self.assertNotIn("CALLCAP", {a.constant for a in assocs})

    def test_a_printed_variable_that_is_never_capped_does_not_associate(self) -> None:
        assocs = dataflow_cap_associations({"fixture.asm": DATAFLOW_ASM_FIXTURE})
        self.assertNotIn(("GBRS", "stack"), {(a.token, a.field) for a in assocs})

    def test_breaking_the_variable_link_kills_the_association(self) -> None:
        """The join really is on the variable name, not on adjacency: rename
        only the PRINTED load and the association must disappear."""
        broken = DATAFLOW_ASM_FIXTURE.replace(
            "mov     ax, [enc_count]\n        call    print_hex_word",
            "mov     ax, [other_var]\n        call    print_hex_word", 1)
        self.assertNotEqual(broken, DATAFLOW_ASM_FIXTURE, "fixture edit missed")
        self.assertEqual(
            dataflow_cap_associations({"fixture.asm": broken}), [])

    def test_a_cmp_against_a_non_equ_name_is_not_a_cap(self) -> None:
        text = DATAFLOW_ASM_FIXTURE.replace("ENCCAP      equ 8\n", "", 1)
        self.assertEqual(
            dataflow_cap_associations({"fixture.asm": text}), [],
            "ENCCAP is no longer a declared equ, so `cmp ax, ENCCAP` must "
            "stop being read as a cap -- otherwise any bare uppercase token "
            "would manufacture an association.",
        )

    def test_the_window_is_bounded(self) -> None:
        """Padding the cap check away from its store past the window must
        break the link, or the peephole is really a whole-file scan."""
        padded = DATAFLOW_ASM_FIXTURE.replace(
            "        ja      .bad\n        mov     [enc_count], ax",
            "        ja      .bad\n" + "        nop\n" * (_DATAFLOW_WINDOW + 2)
            + "        mov     [enc_count], ax", 1)
        self.assertEqual(
            dataflow_cap_associations({"fixture.asm": padded}), [])

    def test_a_shared_variable_is_reaching_definition_aware(self) -> None:
        """2026-09-23 (plan §32.3, cause A): two routines sharing ONE variable
        name, only one of which caps it before storing, must not let the
        capped routine's cap leak onto the other's print -- this is exactly
        the `ccefx.asm` `dump_gbsx`/`dump_gbsl` shape (both reuse
        `[script_count]`; only `dump_gbsx` caps it) reduced to a fixture."""
        text = """\
CAPX equ 8
routine1:
        mov     ax, [something]
        cmp     ax, CAPX
        ja      .bad
        mov     [shared], ax
        mov     dx, s_toka_count
        call    print_z
        mov     ax, [shared]
        call    print_hex_word
        ret
routine2:
        mov     [shared], ax
        mov     dx, s_tokb_count
        call    print_z
        mov     ax, [shared]
        call    print_hex_word
        ret
s_toka_count  db 'TOKA count=',0
s_tokb_count  db 'TOKB count=',0
"""
        assocs = dataflow_cap_associations({"fixture.asm": text})
        self.assertEqual([a.triple for a in assocs],
                         [("TOKA", "count", "CAPX")])


class SyntheticRuleTests(unittest.TestCase):
    def scan(self, name, text, current=64, superseded=(16, 32)):
        return scan_script_text(name, text, _ASSOC, current, superseded)

    def test_fires_on_the_gbcoab_shape(self) -> None:
        found = self.scan("gbcoab-flow-test.ps1", GBCOAB_FIXTURE)
        self.assertEqual(len(found), 1, [f.describe() for f in found])
        self.assertEqual(found[0].needle, "GBSX count=0010")
        self.assertEqual(found[0].pinned_value, 16)
        self.assertEqual(found[0].current_value, 64)
        self.assertEqual(found[0].constant, "SCRIPTCAP")

    def test_does_not_fire_on_the_corrected_gbbuck_shape(self) -> None:
        self.assertEqual(self.scan("gbbuck-flow-test.ps1", GBBUCK_FIXTURE), [])

    def test_pinned_record_indices_no_longer_suppress_anything(self) -> None:
        """THE RETRACTED HEURISTIC, pinned so it cannot come back.

        `CCEFX_FIXTURE` pins `#00`..`#0F` beside `count=0010` -- exactly the
        shape the first draft treated as proof the count was correct. It is
        also exactly the shape a CAP-TRUNCATED dump produces, so it must now
        be a candidate finding like any other, excused only by name in
        `SELF_AUTHORED_PINS`."""
        found = self.scan("ccefx-test.ps1", CCEFX_FIXTURE)
        self.assertEqual(len(found), 1, [f.describe() for f in found])
        self.assertEqual(
            unquarantined(found, {}, SELF_AUTHORED_PINS), [],
            "and the allowlist, not the index pattern, is what excuses it",
        )

    def test_a_whole_line_powershell_comment_is_not_a_pin(self) -> None:
        """`gbdqk-multistep-flow-test.ps1` carries a commented-out
        `#   GBSX count=0002`; prose is not a pin."""
        self.assertEqual(self.scan("x.ps1", "  #   GBSX count=0010"), [])
        self.assertEqual(len(self.scan("x.ps1", "  'GBSX count=0010',")), 1)

    def test_the_current_value_is_a_CEILING_finding_not_a_silent_pass(self) -> None:
        """PRESENT-TENSE TRUNCATION -- the defect this file was blind to until
        2026-09-10. `count=0040` is 0x40 == 64 == today's SCRIPTCAP, i.e. the
        single most suspicious value in the whole space, and the first draft
        returned [] for it."""
        text = GBCOAB_FIXTURE.replace("count=0010", "count=0040")
        found = self.scan("gbcoab-flow-test.ps1", text)
        self.assertEqual(len(found), 1, [f.describe() for f in found])
        self.assertEqual(found[0].kind, KIND_CEILING)
        self.assertEqual(found[0].pinned_value, 64)
        self.assertEqual(of_kind(found, KIND_SUPERSEDED), [])
        self.assertIn("CANDIDATE for truncation, not a proof", found[0].describe())

    def test_a_ceiling_pin_is_excusable_and_the_excuse_is_two_sided(self) -> None:
        """A script that AUTHORS a payload of exactly SCRIPTCAP events pins the
        ceiling legitimately, so the ceiling check needs the same allowlist the
        drift check has -- and an entry that stops matching must go stale."""
        text = GBCOAB_FIXTURE.replace("count=0010", "count=0040")
        found = self.scan("self-authored.ps1", text)
        self.assertEqual(len(found), 1)
        allow = {("self-authored.ps1", "GBSX count=0040"): "authors 64 events"}
        self.assertEqual(unquarantined(found, {}), found)
        self.assertEqual(unquarantined(found, {}, allow), [])
        self.assertEqual(stale_exception_keys(found, {}, allow), [])
        ghost = dict(allow)
        ghost[("gone.ps1", "GBSX count=0040")] = "no longer real"
        self.assertEqual(stale_exception_keys(found, {}, ghost),
                         [("gone.ps1", "GBSX count=0040")])

    def test_ceiling_and_superseded_are_reported_as_distinct_kinds(self) -> None:
        """One scanner emits both, so the partition must actually partition --
        otherwise one check could silently absorb the other's findings."""
        text = ("  'GBSX count=0010',\n"
                "  'GBSX count=0040',\n"
                "  'GBSX count=0003',\n")
        found = self.scan("mixed.ps1", text)
        self.assertEqual(len(found), 2, [f.describe() for f in found])
        self.assertEqual([f.pinned_value for f in of_kind(found, KIND_SUPERSEDED)],
                         [16])
        self.assertEqual([f.pinned_value for f in of_kind(found, KIND_CEILING)],
                         [64])

    def test_a_ceiling_pin_on_a_never_changed_constant_still_fires(self) -> None:
        """`ENCCAP` and `NPCCAP` have empty superseded sets. The ceiling check
        must still cover them -- this is the hole the removed
        `if not superseded: continue` would have left."""
        assoc = Association("GBEC", "groups", "ENCCAP", "fixture", "dataflow")
        found = scan_script_text("x.ps1", "  'GBEC groups=0008',\n",
                                 assoc, 8, superseded=())
        self.assertEqual([f.kind for f in found], [KIND_CEILING])
        self.assertEqual(
            scan_script_text("x.ps1", "  'GBEC groups=0002',\n",
                             assoc, 8, superseded=()), [])

    def test_does_not_fire_on_a_value_the_constant_never_held(self) -> None:
        text = GBCOAB_FIXTURE.replace("count=0010", "count=0011")
        self.assertEqual(self.scan("gbcoab-flow-test.ps1", text), [])

    def test_fires_on_the_other_superseded_value_too(self) -> None:
        text = GBCOAB_FIXTURE.replace("count=0010", "count=0020")  # 0x20 == 32
        found = self.scan("gbcoab-flow-test.ps1", text)
        self.assertEqual([f.pinned_value for f in found], [32])

    def test_a_different_field_of_the_same_token_is_not_matched(self) -> None:
        text = GBCOAB_FIXTURE.replace("GBSX count=0010", "GBSX other=0010")
        self.assertEqual(self.scan("x.ps1", text), [])

    def test_quarantine_suppresses_and_a_stale_entry_is_detectable(self) -> None:
        """Both sides of the quarantine mechanism, over fixtures, so the
        mechanism is exercised even while QUARANTINE is empty."""
        found = self.scan("gbcoab-flow-test.ps1", GBCOAB_FIXTURE)
        self.assertEqual(len(found), 1, "fixture must produce a finding first")
        entry = {"owner": "fixture", "expiry": "2999-01-01", "note": "fixture"}
        matching = {("gbcoab-flow-test.ps1", "GBSX count=0010"): entry}
        # Suppression: a matching entry takes the finding out of the red set...
        self.assertEqual(unquarantined(found, {}), found)
        self.assertEqual(unquarantined(found, matching), [])
        # ...and is NOT reported stale, because it matches something live.
        self.assertEqual(stale_exception_keys(found, matching), [])
        # An entry for a finding that no longer exists IS reported stale, so
        # neither exception list can outlive the thing it excuses.
        ghost = dict(matching)
        ghost[("ghost-test.ps1", "GBSX count=0020")] = entry
        self.assertEqual(stale_exception_keys(found, ghost),
                         [("ghost-test.ps1", "GBSX count=0020")])
        # Both maps feed the same staleness check.
        self.assertEqual(
            stale_exception_keys(found, {}, {("z.ps1", "GBSX count=0020"): "r"}),
            [("z.ps1", "GBSX count=0020")])

    def test_quarantine_expiry_and_shape_are_enforced(self) -> None:
        """Proves `quarantine_problems` can fire, which the live test that
        calls it cannot do while QUARANTINE is empty."""
        today = datetime.date(2026, 9, 10)
        key = ("x.ps1", "GBSX count=0010")
        good = {key: {"owner": "someone", "expiry": "2026-10-10", "note": "why"}}
        self.assertEqual(quarantine_problems(good, today), [])
        expired = {key: {"owner": "someone", "expiry": "2026-09-09", "note": "why"}}
        self.assertIn("EXPIRED", " ".join(quarantine_problems(expired, today)))
        undated = {key: {"owner": "someone", "expiry": "soon", "note": "why"}}
        self.assertIn("not an ISO date", " ".join(quarantine_problems(undated, today)))
        unowned = {key: {"owner": "", "expiry": "2026-10-10", "note": "why"}}
        self.assertIn("missing owner", " ".join(quarantine_problems(unowned, today)))


# ===========================================================================
# HISTORY + LIVE: replay against the two REAL scripts from the 5871cc6 case.
# ===========================================================================
class HistoricalReplayTests(unittest.TestCase):
    """The mandatory can-it-fail evidence, over real repo files rather than
    fixtures. `gbcoab-flow-test.ps1` is the known-bad pin from `5871cc6`;
    `gbbuck-flow-test.ps1` is the sibling that commit DID touch."""

    @classmethod
    def setUpClass(cls) -> None:
        # FAILS rather than skips when .git is absent. CLAUDE.md's skip
        # convention covers never-vendored EXTERNAL sources (the D:\ Amiga and
        # C64 images, DOSBox-X, VICE); the repo's own history is not one of
        # those, and this class carries the only assertion that reports the
        # deliverable. A test that can skip itself can pass without running --
        # this repo has been bitten by exactly that.
        if not (REPO_ROOT / ".git").exists():
            raise AssertionError(
                "no .git: constant history is unavailable, so the live half "
                "of this guard cannot run. This is a hard failure on purpose."
            )
        cls.findings = live_findings()

    def test_scriptcap_history_is_the_documented_16_32_64(self) -> None:
        declaring = [
            f"native/src/{n}" for n, t in sorted(load_asm_texts().items())
            if "SCRIPTCAP" in parse_equ_constants(t)
        ]
        self.assertTrue(declaring, "no native/src/*.asm declares SCRIPTCAP")
        self.assertEqual(
            constant_value_history("SCRIPTCAP", declaring), {16, 32, 64},
            "SCRIPTCAP's history is the anchor for every finding here. "
            "16 -> 32 (cca0655) -> 64 (5871cc6), cross-checked against a "
            "per-commit git-show walk on 2026-09-10.",
        )

    #: The `gbcoab-flow-test.ps1` line as it stood from 2026-07-15 until it was
    #: re-measured on 2026-09-10. FROZEN TEXT, not a file read: this is the
    #: detection proof, and a detection proof that reads the live file dies the
    #: moment the defect it proves is fixed -- which is exactly what happened
    #: here. The old live-scan version of this test asserted the bad pin was
    #: STILL PRESENT, so fixing the pin turned the guard red, and the only two
    #: options its own message offered were "delete this assertion" or "the
    #: rule stopped working". Neither is right: the rule works, the bug is
    #: gone, and the evidence that the rule catches it must outlive the bug.
    HISTORICAL_GBCOAB_LINE = "  'GBSX count=0010',"

    def test_fixture_replays_the_historical_gbcoab_pin(self) -> None:
        """The 2026-07-15 pin is still detected, from frozen text."""
        association = Association(
            token="GBSX", field="count", constant="SCRIPTCAP",
            citation="frozen replay",
        )
        found = scan_script_text(
            "gbcoab-flow-test.ps1", self.HISTORICAL_GBCOAB_LINE,
            association, current_value=64, superseded={16, 32},
        )
        self.assertEqual(len(found), 1, "the historical pin is no longer detected")
        self.assertEqual(found[0].pinned_value, 16)
        self.assertEqual(found[0].current_value, 64)
        self.assertEqual(found[0].kind, KIND_SUPERSEDED)
        self.assertFalse(found[0].declared_saturated)
        self.assertEqual(
            unquarantined(found, {}, {}), found,
            "and it must reach the red set -- a detected finding that is "
            "excused by default would make this replay vacuous",
        )

    def test_live_gbcoab_pin_is_fixed_and_stays_fixed(self) -> None:
        """The live half, INVERTED on 2026-09-10 when the pin was re-measured.

        `gbcoab-flow-test.ps1` pinned `GBSX count=0010` (16). Re-measured in
        DOSBox that day: the real count is 0x0037 (55), and 16 was the
        2026-07-15 value of `SCRIPTCAP` clamping it. The script now pins 55 and
        carries a cap-derived truncation guard at all five of its GBSX sites.

        This assertion is the REGRESSION side of the frozen replay above: the
        replay proves the rule can catch the pin, this proves the repo no
        longer contains it."""
        self.assertEqual(
            [f.describe() for f in self.findings
             if f.script == "gbcoab-flow-test.ps1"], [],
            "gbcoab-flow-test.ps1 has a cap-drift candidate again. It was "
            "measured clean on 2026-09-10; do not re-pin a count that "
            "coincides with a value SCRIPTCAP once held without measuring it.",
        )

    # Frozen shape of the former two ceiling declarations. The live routes
    # now publish full GBSL sidecars; historical detection must outlive that fix.
    HISTORICAL_SATURATION_RECORDS = """\
$capConstant = 'SCRIPTCAP'
Invoke-CoabBlockEngineSmoke 4 34 33 @("GBSX count=0040") -GbsxSaturated $true
Invoke-DqkEngineSmoke "area26" "DQK /A 26" " /A 26" 26 @("GBSX count=0040") $false $false -GbsxSaturated $true
"""

    def test_historical_ceiling_declarations_keep_their_guard(self) -> None:
        association = Association("GBSX", "count", "SCRIPTCAP", "frozen replay")
        found = scan_script_text("gbboot-test.ps1", self.HISTORICAL_SATURATION_RECORDS,
                                 association, 64, {16, 32})
        self.assertEqual([f.kind for f in found], [KIND_CEILING, KIND_CEILING])
        self.assertTrue(all(f.declared_saturated for f in found))
        self.assertEqual(unquarantined(found, {}, {}), [])

    def test_historical_saturation_excuse_is_derived_from_its_input(self) -> None:
        text = self.HISTORICAL_SATURATION_RECORDS
        association = Association("GBSX", "count", "SCRIPTCAP", "frozen mutation")

        def red(body):
            found = scan_script_text("gbboot-test.ps1", body, association, 64, {16, 32})
            return of_kind(unquarantined(found, {}, {}), KIND_CEILING)

        self.assertEqual(red(text), [])
        for old, new, count in (
            (') -GbsxSaturated $true', ') $true', 1),
            ('-GbsxSaturated $true', '-GbecSaturated $true', 2),
            ('SCRIPTCAP', 'SOMEOTHERCAP', 2),
            ('$false $false -GbsxSaturated $true', '$false $false $true', 1),
        ):
            mutated = text.replace(old, new)
            self.assertNotEqual(mutated, text)
            findings = red(mutated)
            self.assertEqual(len(findings), count)
            self.assertEqual([f.key for f in findings],
                             [('gbboot-test.ps1', 'GBSX count=0040')] * count)
            subjects = [mutated.splitlines()[f.line - 1] for f in findings]
            expected = (['Invoke-CoabBlockEngineSmoke'] if old.startswith(') ')
                        else ['Invoke-DqkEngineSmoke "area26"'] if count == 1
                        else ['Invoke-CoabBlockEngineSmoke', 'Invoke-DqkEngineSmoke "area26"'])
            self.assertEqual(len(subjects), len(expected))
            for line, subject in zip(subjects, expected):
                self.assertIn(subject, line, 'correct finding count must retain its actual subject')

    def assert_live_complete_trace_pins(self, text: str) -> None:
        code = '\n'.join(line for line in text.splitlines() if not line.lstrip().startswith('#'))
        coab = next(line for line in code.splitlines()
                    if line.strip().startswith('Invoke-CoabBlockEngineSmoke 4 34 33 '))
        dqk = next(line for line in code.splitlines()
                   if line.strip().startswith('Invoke-DqkEngineSmoke "area26" '))
        self.assertIn('GBSL count=0056', coab)
        self.assertIn('-GbsxAboveCap $true', coab)
        self.assertIn('GBSL count=0070', dqk)
        # The sidecar totals are finite, not ceiling exemptions. Both are
        # independently pinned, and the CoAB call owns its explicit cap guard.
        cap = parse_equ_constants(load_asm_texts()['ccecl.asm'])['SCRIPTCAP']
        self.assertGreater(0x56, cap)
        self.assertGreater(0x70, cap)
        helper = code.split('function Assert-GbsxAboveCap', 1)[1].split('function ', 1)[0]
        self.assertIn('$cap = Get-ScriptCap', helper)
        self.assertIn('$count = Get-GbsxCount $Text $Label', helper)
        self.assertIn('if ($count -le $cap)', helper)
        self.assertIn('if ($GbsxAboveCap) { Assert-GbsxAboveCap $gbsxText',
                      re.sub(r'\s+', ' ', code))

    def test_live_former_ceiling_routes_publish_complete_sidecars(self) -> None:
        text = (REPO_ROOT / 'native/gbboot-test.ps1').read_text(encoding='utf-8')
        self.assert_live_complete_trace_pins(text)
        self.assertEqual([f for f in self.findings if f.kind == KIND_CEILING], [])

    def test_live_complete_trace_guard_and_counts_are_required(self) -> None:
        text = (REPO_ROOT / 'native/gbboot-test.ps1').read_text(encoding='utf-8')
        self.assert_live_complete_trace_pins(text)
        for old, new in (
            ('-GbsxAboveCap $true', '-GbsxAboveCap $false'),
            ('GBSL count=0056', 'GBSX count=0040'),
            ('GBSL count=0070', 'GBSX count=0040'),
            ('if ($count -le $cap)', 'if ($count -lt $cap)'),
            ('if ($GbsxAboveCap)', 'if ($false)'),
        ):
            mutated = text.replace(old, new)
            self.assertNotEqual(mutated, text)
            with self.assertRaises(AssertionError):
                self.assert_live_complete_trace_pins(mutated)

    def test_live_scan_control_gbbuck_does_not_fire(self) -> None:
        self.assertEqual(
            [f.describe() for f in self.findings
             if f.script == "gbbuck-flow-test.ps1"], [],
            "gbbuck-flow-test.ps1's GBSX count=0002 is not a value SCRIPTCAP "
            "ever held, so a rule that flags it is flagging on the token "
            "alone. NOTE, corrected 2026-09-10: 5871cc6 did NOT correct this "
            "needle -- its gbbuck hunk was a record-LENGTH pin, 4022 -> 5750. "
            "This control is weaker than it first read, and "
            "test_does_not_fire_on_a_value_the_constant_never_held is the "
            "sharper form of the same check.",
        )

    def test_live_ccefx_pin_is_a_candidate_excused_only_by_the_allowlist(self) -> None:
        """Two-sided, and deliberately NOT `assertEqual(..., [])`.

        `native/ccefx-test.ps1` pins the same `GBSX count=0010` literal and is
        CORRECT, because it builds its own 16-event input. It must still be a
        CANDIDATE -- if it silently stopped being one, `SELF_AUTHORED_PINS`
        would be excusing nothing and a real regression there would be
        invisible."""
        candidates = [f for f in self.findings if f.script == "ccefx-test.ps1"]
        self.assertEqual(
            len(candidates), 1,
            "ccefx-test.ps1's self-authored pin is no longer a candidate; the "
            "allowlist entry that excuses it is now excusing nothing.",
        )
        self.assertIn(candidates[0].key, SELF_AUTHORED_PINS)
        self.assertEqual(
            unquarantined(candidates, QUARANTINE, SELF_AUTHORED_PINS), [],
            "and it must not reach the red set",
        )

    def test_associated_constants_agree_across_files(self) -> None:
        """`live_findings` raises when an associated constant has disagreeing
        current values across the files that declare it. Four same-name
        constants in this tree already disagree (DAXTOC_ENTRIES 128/64,
        DAX_FILEMAX 32768/60000, PARTY_MEMBER_AFFECT_MAX 8/4,
        PARTY_MEMBER_SPELL_MAX 16/4), so if one of them ever gains a
        magic/max doc pair this must be loud, not a silent `continue`."""
        asm_texts = load_asm_texts()
        problems = []
        for assoc in cap_associations(asm_texts):
            values = {
                name: parse_equ_constants(text)[assoc.constant]
                for name, text in asm_texts.items()
                if assoc.constant in parse_equ_constants(text)
            }
            if len(set(values.values())) > 1:
                problems.append(f"{assoc.constant}: {values}")
        self.assertEqual(problems, [], "; ".join(problems))

    def test_exception_lists_have_no_stale_entries(self) -> None:
        # NOT vacuous: SELF_AUTHORED_PINS has one entry, so this assertion has
        # real input and goes red if that entry stops matching a candidate --
        # proven by mutation (change ccefx's pin and this fires). The same
        # function is also driven over fixtures by
        # SyntheticRuleTests.test_quarantine_suppresses_and_a_stale_entry_is_detectable.
        stale = stale_exception_keys(self.findings, QUARANTINE, SELF_AUTHORED_PINS)
        self.assertEqual(
            stale, [],
            "QUARANTINE / SELF_AUTHORED_PINS entries with no matching "
            "candidate finding. An exception that outlives its subject is a "
            f"silent exclusion; delete these: {stale}",
        )

    def test_quarantine_entries_are_well_formed_and_unexpired(self) -> None:
        """VACUOUS WHILE `QUARANTINE` IS EMPTY, and saying so is the point --
        an empty-input assertion cannot fail, so it is not evidence. The rule
        it applies is proven able to fire over fixtures by
        `SyntheticRuleTests.test_quarantine_expiry_and_shape_are_enforced`,
        which drives the SAME `quarantine_problems` function."""
        problems = quarantine_problems(QUARANTINE, datetime.date.today())
        self.assertEqual(problems, [], "; ".join(problems))

    def test_no_unquarantined_cap_constant_drift(self) -> None:
        """THE FINDING. Red on HEAD 2026-09-10 with six real hits."""
        offenders = of_kind(
            unquarantined(self.findings, QUARANTINE, SELF_AUTHORED_PINS),
            KIND_SUPERSEDED)
        self.assertEqual(
            offenders, [],
            "native/*.ps1 pins holding a value the associated native/src cap "
            "constant no longer holds. These are CANDIDATES, not verdicts: "
            "the instrument cannot separate a clamped count from a genuine "
            "count that coincides with an old cap (see the docstring's "
            "'THE FALSE POSITIVE THIS INSTRUMENT CANNOT RULE OUT'). What it "
            "CAN say about today's six is that `GBSX count=` is a saturating "
            "counter, so every one of them is a candidate CLAMPED COUNT -- "
            "min(real_events, SCRIPTCAP) -- not merely a stale constant, and "
            "two of the six have observed values far above any historical "
            "cap. The correct replacement value must come from a real DOSBox "
            "run -- do NOT guess it. Fix them, or add a loud, dated, owned "
            "QUARANTINE entry.\n  - "
            + "\n  - ".join(f.describe() for f in offenders),
        )

    def test_no_pin_sits_exactly_on_the_current_cap(self) -> None:
        """THE COMPANION FINDING, added 2026-09-10. Measured ZERO on HEAD --
        and a zero is reported as a zero, not implied to be a catch.

        Predicate: no `native/*.ps1` pin may hold the CURRENT value of its
        associated cap constant. A count sitting exactly on its own ceiling is
        the printed form of a silently truncated trace, and `GBSX count=` has
        no overflow flag, halt reason or marker to distinguish that from a
        genuinely exactly-full one -- they are byte-identical.

        Live census 2026-09-10 over 96 `native/*.ps1`, comment lines excluded:
        59 `GBSX count=` pins, values {0:16, 1:11, 2:7, 3:4, 4:3, 5:4, 6:1,
        7:4, 10:2, 16:7} -- ZERO at 0x0040 (64) and zero at 0x0020 (32).
        26 `GBEC groups=` pins, values {1:17, 2:9} -- zero at 8.
        2 `GBNJ joins=` pins, values {1, 3} -- zero at 8. Total: 0 findings.

        SUPERSEDED THE SAME DAY, and the zero above is exactly why this is
        written out rather than edited away. Those six `GBSX count=0010` pins
        were then re-measured in DOSBox, and one of them -- CoAB `/A 4 /B 34`
        in `gbboot-test.ps1` -- came back at 0x0040 (64), `SCRIPTCAP` exactly.
        So the census flipped from 0 ceiling pins to 1 the moment the drift
        findings were resolved, because resolving a clamped pin honestly can
        PRODUCE a ceiling pin: the trace really does saturate, and 64 is the
        only number the engine can print for it. The current live figure is
        1 CEILING candidate, 0 red -- see `saturation_declared` for why a
        declared one is not a defect, and note that a "0 findings" line in a
        docstring is a measurement with a date, not an invariant.

        It can nonetheless fire, proven over fixtures by
        `SyntheticRuleTests.test_the_current_value_is_a_CEILING_finding_not_a_silent_pass`
        and three siblings. Note what this check's SHAPE is worth: it would
        have gone red on 2026-07-15, the day the six `GBSX count=0010` pins
        were written, because `SCRIPTCAP` was 16 then and those pins sat
        exactly on it. The drift check only noticed them 57 days later, after
        the constant moved twice. Present tense catches the defect at
        authoring time; superseded tense catches it at the next bump.
        """
        offenders = of_kind(
            unquarantined(self.findings, QUARANTINE, SELF_AUTHORED_PINS),
            KIND_CEILING)
        self.assertEqual(
            offenders, [],
            "native/*.ps1 pins sitting exactly ON today's cap value. Each is "
            "a probable TRUNCATED trace: the producer saturates and the "
            "dumper validates rather than clamps, so nothing in the output "
            "says the list was cut off. There are THREE honest resolutions "
            "and raising the pin to match is none of them: (1) measure the "
            "real count in a DOSBox run and pin that; (2) if the script "
            "AUTHORS its own payload of exactly that many records, list it in "
            "SELF_AUTHORED_PINS with that reason; (3) if the measurement is "
            "that the trace genuinely SATURATES -- so the real total is "
            "unknown and >= the cap, and is unrecoverable without raising the "
            "cap and rebuilding -- declare it at the call site with "
            "`-<Token>Saturated $true` and let the script's cap-derived guard "
            "assert equality, so raising the cap re-opens the question "
            "instead of silently passing. (3) is DERIVED from the script, not "
            "listed here, so the excuse cannot outlive the guard.\n  - "
            + "\n  - ".join(f.describe() for f in offenders),
        )

    def test_the_live_scan_plan_covers_all_three_associations(self) -> None:
        """Assert WHAT GETS SCANNED, not only what is found.

        All three associations contribute zero ceiling findings today and two
        of them contribute zero findings of any kind, so a regression that
        stopped scanning `ENCCAP` and `NPCCAP` would change no count anywhere
        and every finding-based assertion in this file would stay green. That
        is the exact shape of the vacuity this repo keeps shipping, so the
        plan itself is pinned. Re-adding `if not superseded: continue` to
        `scan_plan` takes this from 3 targets to 1 and turns it red."""
        plan = {t.association.constant: t for t in scan_plan()}
        self.assertEqual(sorted(plan), ["ENCCAP", "NPCCAP", "SCRIPTCAP"])
        self.assertEqual(plan["SCRIPTCAP"].current_value, 64)
        self.assertEqual(sorted(plan["SCRIPTCAP"].superseded), [16, 32])
        for never_changed in ("ENCCAP", "NPCCAP"):
            self.assertEqual(plan[never_changed].current_value, 8)
            self.assertEqual(
                sorted(plan[never_changed].superseded), [],
                f"{never_changed} has acquired a superseded value. Measured "
                f"2026-09-10 it had none -- `git log -p` shows a `+` side "
                f"only, never a `-` side -- which is why the defect-1 fix "
                f"that added it as an association added ZERO findings. If "
                f"that changed, the null in the docstring is out of date.",
            )

    def test_the_ceiling_check_covers_every_association_not_just_scriptcap(
            self) -> None:
        """Two-sided cover for the removed `if not superseded: continue`.

        `ENCCAP` and `NPCCAP` have never changed value, so they contribute no
        superseded candidates at all. If the ceiling scan silently stopped
        running for them, this file's docstring would be claiming three
        associations while only one was actually being checked, and the
        finding count -- zero -- would look identical either way. That is the
        exact shape of a vacuous check, so it is asserted rather than assumed:
        the scan really is invoked with each association's current value."""
        asm_texts = load_asm_texts()
        assocs = cap_associations(asm_texts)
        self.assertEqual(len(assocs), 3, [a.triple for a in assocs])
        for assoc in assocs:
            declaring = [t for t in asm_texts.values()
                         if assoc.constant in parse_equ_constants(t)]
            current = parse_equ_constants(declaring[0])[assoc.constant]
            probe = f"  '{assoc.prefix}{current:04X}',\n"
            found = scan_script_text("probe.ps1", probe, assoc, current, ())
            self.assertEqual(
                [f.kind for f in found], [KIND_CEILING],
                f"a pin on {assoc.constant}'s current value ({current}) is "
                f"not detected as a ceiling candidate; the ceiling check does "
                f"not really cover {assoc.triple}.",
            )


if __name__ == "__main__":  # pragma: no cover
    for f in live_findings():
        print(f.describe())
