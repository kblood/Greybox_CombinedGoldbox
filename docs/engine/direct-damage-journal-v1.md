# Direct-DAMAGE journal v1

`GBDJ` is a retained, roster-sibling journal for compact-DoK direct DAMAGE.
Its reader is `CCHOST /R <absolute-roster> <absolute-save-directory>`. The
producer is `CCHOST /D <effect> <roster> /J` (plan step 7a): it writes a
PREPARED journal through a `.GDN` temp file and a rename, before the first
sink write, then marks the journal COMMITTED after the legacy write pass.
GBBOOT does not invoke `/J` or `/R` yet (plan step 9); this is not a
production publication protocol. *(Superseded 2026-09-23 by plan step 9:
GBBOOT now runs `/R <roster>` at every DoK boot and `/D … /J` for DoK direct
DAMAGE; see amendment L. Step 9 is committed to `greybox` but must not enter
a packaged release until the relative-binding decision in
`DECISIONS-NEEDED.md` is answered.)*

**Amended in place on 2026-09-22 (plan step 3).** No journal writer had shipped,
so no v1 file exists anywhere that an amendment could strand. This added the
COMMITTED state (G1), fixed the source-directory meaning (G2), fixed canonical
path identities (G3), specified the producer's ordering and replacement rules
(G4), specified the cross-field checks (G5), specified the missing-effect
policy (G6), and stated the CoK scope (G8). The reasoning is in
`PLAN-DIRECT-DAMAGE-JOURNAL-2026-09-22.md` §8. **The window for changing this
format in place closes when plan step 7 (the producer) lands.** After that, any
change is a v2.

All integers are little-endian. File offsets and extents are u32.

| Offset | Field |
|---:|---|
| 0 | `GBDJ` magic |
| 4 | u16 version (`1`) |
| 6 | u16 state: `0` PREPARED, `1` COMMITTED; any other value is invalid |
| 8 | nonzero u64 GBDO generation |
| 16 | u16 flags (`1`: compact DoK; no other bits are defined in v1) |
| 18 | u16 targeted-party mask (nonzero) |
| 20 | u32 exact fixed-effect extent (`5750` = GBEF v9, `5920` = GBEF v14) |
| 24 | u32 exact GBSL extent (`0`, or `8 + 54*count`) |
| 28 | u16 exact GBPR extent |
| 30 | u16 zero |
| 32 | zero-padded canonical effect path (112 bytes) |
| 144 | zero-padded canonical roster path (112 bytes) |
| 256 | zero-padded canonical token path (112 bytes) |
| 368 | zero-padded canonical save-directory path (112 bytes) |
| 480 | exact GBPR preimage |
| after GBPR | six source entries, `{present:u8, slot:u8, raw[216]}` |
| after source entries | exact fixed effect, then exact optional GBSL |

The exact extent is `1788 + gbpr_extent + effect_extent + sidecar_extent`.
Every addition must reject u32 carry, and EOF must equal that value. The
largest supported journal is 1788 + 2476 + 5750 + 65510 = 75,524 bytes. That is
above 64 KiB, so any journal file position past the source table must be kept
as u32. The GBSL part is read by sequential streaming or by `CX:DX` seeks, never
by u16 offset arithmetic.

## Source entries

A `present=0` entry is all 218 bytes zero, including the presence byte. A
present entry has `present=1`. It is indexed by party ordinal, has a unique
slot 1..6 that matches the preimage slot, and holds the entire 216-byte raw
source preimage (raw bytes 40 and 214 may differ). A present entry exists if
and only if its party ordinal is targeted and its preimage has a low source
slot. High-bit native-only slots, unselected ordinals, and ordinals outside
the roster count all require an absent entry.

## Path identities (G2, G3)

**Canonical form.** All four stored path fields and both `/R` arguments must be
in one canonical absolute form. The producer's four `/D` arguments must be too
(see below). The form is:

- `X:\` (drive letter `A`..`Z`), followed by one or more components separated
  by a single `\`;
- no lowercase `a`..`z` anywhere;
- no `/`;
- no empty component, so no `\\` and no trailing `\`. This means the bare root
  `X:\` is not a valid identity;
- no component equal to `.` or `..`;
- NUL-terminated inside the field, with zero padding after the NUL.

Validation is purely syntactic. There is no INT 21h/60h TRUENAME call. A path
reached through a SUBST/JOIN alias, or spelled differently, is a *different*
identity and fails closed. The only intended caller is GBBOOT, which builds
these strings itself. It must emit them in this form, and in particular it must
uppercase them. Adding TRUENAME later only widens what is accepted and needs no
format change, which is why the strict rule was chosen as the default.

**Save directory.** This is the DoK `SAVE` directory *itself*, not the game
root. The target for source slot *n* is `<dir>\CHRDATA<n>.GAM`. The directory
string is at most **98** characters, so the target is at most 111 characters
plus NUL and fits `PATH_MAX` = 112. `/R` rejects a longer directory as an
argument error.

**Derived siblings.** The rules are separator-aware: a `.` inside a directory
name is not an extension.

- Journal: the roster path with its final extension replaced by `.GDJ`.
- Producer temporary: the same, with `.GDN`. `/R` never reads a `.GDN`.
- GBSL: the effect path with its final extension replaced by `.GBS`. This is
  the same rule as `make_damage_side_name`. The effect path must have an
  extension whenever the GBSL extent is nonzero.

## Reader validation (all states)

- Header: magic, version, state (0 or 1), nonzero generation, flags = 1,
  reserved word 0, mask nonzero and within the roster count.
- All four path fields are canonical. The roster and save-directory fields
  equal the `/R` arguments byte for byte.
- Embedded GBPR: exact extent, `GBPR` v1, stride 410, `GBD1` capability, count
  <= 6, and every member marker.
- Source entries as above.
- Extents: the u32 sum, exact EOF, fixed-effect extent 5750 or 5920.
- The retained effect begins `GBEF`. Its version word (+4) is 9 when the extent
  is 5750 and 14 when it is 5920.
- The retained effect's flags word (+6) has `FX_HAVE_SIDECAR` (0100h) set **if
  and only if** the GBSL extent is nonzero. v14 (5920) therefore always has a
  zero GBSL extent and a clear flag.
- A nonzero GBSL extent means the retained GBSL begins `GBSL`, has u16 version
  1 at +4, has u16 count 1..1213 at +6, and its extent equals exactly
  `8 + 54*count`. The largest is 65,510, so the high word is always zero.

### Check order (decided 2026-09-23, checkpoint 3)

The order *among* the reader checks above (and the PREPARED token and G6
checks below) is **not** normative, with exactly four exceptions, which are:

1. **No path from a journal field is opened before it passes the canonical
   check.** This covers +32 (effect), +256 (token) and the GBSL sibling
   derived from +32. The step-4 reader satisfies it: D3 runs before the token
   open and before G6.
2. **COMMITTED opens no file except the journal.** It never opens the token,
   the current effect, the current GBSL or any destination.
3. **Every reader check completes before destination preflight opens any
   destination.** This includes the header, paths, token, GBPR, source table,
   extents/EOF, G5 and G6. Preflight completes for *every* destination before
   the first write (see "Destination preflight" below).
4. **Every reader rejection produces the same diagnostic**:
   `CCHOST: invalid host request (result)` with exit 1. The only distinct
   failure diagnostics are the argument error, which comes from `parse_args`
   before any file is opened, and the destination-preflight error defined
   below.

**Amended 2026-09-23 (checkpoint 4, for plan step 6).** Rule 4 now has
two non-reader diagnostics besides the argument error, and both are defined
in this file: the destination-preflight error (below) and the restore-phase
error `CCHOST: effect damage recovery incomplete` (see "Restore"). Every
*reader* rejection still prints only `(result)`.

**Why the rest stays free.** Exception 4 makes every reader failure look the
same to GBBOOT and to the player. The relative order of the other groups, for
example the step-4 reader's token check *before* the GBPR/source-table/G5
checks, therefore changes nothing observable except which harmless read-only
opens happen before a rejection. A total order would add fixture obligations
with nothing to protect. Each of the four pinned constraints does protect
something:

- (1) stops a file being opened by a garbage name;
- (2) is G1's "after commit these may have been deleted";
- (3) is the zero-writes rule;
- (4) is what makes (3) observable from outside the process.

**Fixture coverage.**

- (1) is covered indirectly by GJ18/GJ19, where a non-canonical +32/+256
  rejects. A read-only open is not observable from a DOS batch, so there is no
  direct fixture. That is accepted.
- (2) is covered by RJC/RJCM, which are built with no token and no current
  effect.
- (3) and (4) are **not yet discriminated.** The reject loop in
  `cchost-test.ps1` matches `*invalid host request*`, which `(arguments)`
  would also satisfy. Plan step 5 tightens it to the exact `(result)` string
  and adds PFO1: a journal that fails G6 while one destination is read-only
  must print the reader diagnostic, not the preflight one.

## States and recovery (G1, G6)

**PREPARED (0)** means a `/D` may have stopped part-way through writing its
sinks. `/R`:

1. Runs all the checks above.
2. Requires the token at the stored token path to be a valid `GBDO` v1 header
   whose generation equals the journal's.
3. Requires the current effect file, and the current GBSL when the extent is
   nonzero, to exist with the exact retained size and to equal the retained
   bytes exactly.
4. Then (plan steps 5-6) preflights every destination and restores the whole
   GBPR and each present raw record.

It leaves the journal and token unchanged. After a completed restore it prints
`CCHOST: effect damage recovered` and exits 0. Every failure exits 1 with
zero writes. It never reapplies DAMAGE and never deletes the journal (amended
by J.2, plan step 7c: after a *successful* restore, `/R` does delete and
retire the journal — see amendment J below).

**Amended 2026-09-23 (checkpoint 4).** "Every failure exits 1 with zero
writes" holds for every failure up to and including destination preflight.
The one exception is a failure *during* restore, i.e. after the first
destination write has been issued. It is defined in "Restore" below, and it
is convergent: rerunning `/R` completes it. `/R` never writes the journal. In
particular it never writes COMMITTED, because COMMITTED means "the damage was
applied", which is the opposite of what a restore produces.

**COMMITTED (1)** means the producer finished every sink write and then marked
the journal. `/R` runs the "all states" checks, including the path binding to
its own arguments. It does **not** consult the token or the current
effect/GBSL: after commit these may legitimately have advanced or been
deleted. It writes nothing, prints `CCHOST: effect damage already committed`,
and exits 0. **A `/R` after a completed `/D` therefore never rolls back
committed damage.** This closes G1. The journal also serves as the operation
receipt that the 2026-09-20 checkpoint called FINALIZING/receipt, so no
separate receipt file exists.

**Why the current effect is required for PREPARED (G6).** The 2026-09-20
design already requires recovery to run *before* CCFLOW can delete a GBSL or
GBBOOT can overwrite the effect. Because COMMITTED marks completion, a
legitimate PREPARED journal always has its effect still in place. A missing or
changed effect under PREPARED means that ordering was broken, or a foreign
writer intervened, so `/R` fails closed. What the *player* can do about a
journal that fails this way is an open product question, logged in
`DECISIONS-NEEDED.md`. The interim answer is: nothing automatic, and the
journal stays in place.

## Destination preflight (normative for plan step 5; added 2026-09-23)

This runs for PREPARED only, after every reader check (check-order rule 3).

1. **Close the journal first.** The GBPR preimage and the six source entries
   are already in memory, so the journal handle is not needed again. The token,
   effect and GBSL handles are already closed by then.
2. **Destinations.**
   - The roster is the `/R` roster argument.
   - For each **present** source entry, the destination is
     `<save-dir>\CHRDATA<slot>.GAM`, built only from the validated `/R`
     save-directory argument and that entry's slot byte (1..6), per G2.
   - Absent entries name no destination. They are never opened, and their
     files need not exist.
3. **Opening.** Open each destination with INT 21h/3D02h (read/write, existing
   file). Never use 3Ch, 5Bh or 6Ch: a create would truncate a real save, or
   invent one.
4. **Size and position.**
   - Seek to end. The size must equal `gbpr_extent` for the roster and 216 for
     a source, and the high word must be zero.
   - Seek back to 0.
   - Keep the handle.
5. **Handles.** The retained handles are the roster plus at most six sources,
   i.e. seven. With the five standard handles that is 12 of the 20-entry JFT,
   before any handles the caller passes down (G7).
6. **Any failure writes nothing.** A failed open (missing, read-only, or
   out of handles), a wrong size, or a failed seek closes every handle opened
   so far. It prints **`CCHOST: effect damage recovery target unavailable`**
   and exits 1.

A preflight failure has its own diagnostic, unlike the reader rejections,
because it has a different remedy. The journal is sound; a save file is
missing, read-only or the wrong size. A player or GBBOOT can act on that.

**Correction to item 1 (2026-09-23, checkpoint 4, from step 5's PM7
finding).** "The journal handle is not needed again" is true only *after*
G6. `damage_journal_validate_g6` streams the retained effect and GBSL out of
the open journal. `damage_journal_compare_stream` reads `[journal_fh]`
sequentially from where G5 left the pointer. So the journal must stay open
from the header read through the end of G6, and it is closed between G6 and
preflight, which is exactly where the step-5 code closes it. Consequences:

- The reader cannot be reordered to run preflight before G6 without
  reopening and reseeking the journal. Check-order rule 3 forbids that order
  anyway.
- Restore (plan step 6) must take every preimage byte from memory
  (`damage_journal_roster`, `damage_journal_sources`). It must **never**
  reopen or read the journal.
- The handle peak is two phases that never overlap. The reader phase holds
  the journal plus at most one of token/effect/GBSL. The preflight/restore
  phase holds at most seven destinations. The measured boundary (plan §11:
  5 std + 8 inherited + 7 = 20) holds only because of that split. If step
  7's `/D` auto-recovery keeps the journal open into preflight, it costs one
  handle and cuts the inherited allowance from 8 to 7.

## Restore (normative for plan step 6; added 2026-09-23, checkpoint 4)

This runs only after a successful destination preflight. The journal is
closed. The only open files are the (at most) seven retained destination
handles.

1. **Units and order.** Unit 0 is the roster: the embedded GBPR preimage,
   exactly `gbpr_extent` bytes. Units 1..n are the present source entries in
   **ordinal** order: raw 216 bytes from entry offset +2, written through
   `damage_restore_fh[1+ordinal]`. Absent entries have no unit.
   - The order is **pinned for testability, not for safety.** Every unit is an
     idempotent overwrite with bytes from the journal, so any order converges.
     Pinning it lets crash fixtures predict the exact intermediate state.
2. **Each unit.**
   - Seek the handle to 0 with `4200h` explicitly. Do not rely on
     preflight's rewind; the lesson is M5, where a load-bearing seek side
     effect was invisible.
   - Write with `40h` and CX = the unit length, which is never 0. A 0-byte
     `40h` truncates the file, so the write helper refuses CX = 0.
   - Require CF clear **and** AX == the requested length. A short write is a
     failure.
3. **In place, through the retained handles.** Restore never creates,
   truncates, deletes or renames a destination, and never writes to a temp
   file (reasoning in plan §12.3). Destination sizes therefore never change,
   and no directory entry is added or removed.
4. **Close.** After the last unit, close every retained handle with `3Eh`
   and check CF. Close is the durability point, as in G4. INT 21h/68h is
   optional.
5. **Success.** Only once every close has succeeded does `/R` print
   `CCHOST: effect damage recovered` and exit 0.
6. **Restore-phase failure.** A failed seek, write, short write or close
   after preflight:
   - closes every remaining handle;
   - prints exactly `CCHOST: effect damage recovery incomplete`;
   - exits 1.

   Some destinations may already hold their preimage. The journal is still
   PREPARED and unchanged, so the remedy is to rerun `/R`.
7. **The journal and token are never written by `/R`**, in any state or
   outcome.

**Why a rerun is always safe (the idempotency argument).** Take any
interruption during restore: a crash, a torn write, or a power loss that drops
buffered writes.

- It leaves every destination byte equal to either its preimage P or its
  pre-restore value D.
- Sizes are unchanged, because in-place writes inside an existing extent
  never extend or truncate.
- On rerun the reader checks pass again, because `/R` wrote nothing they
  read (journal, token, effect, GBSL).
- Preflight passes again, because the sizes are unchanged.
- Restore maps every P/D mixture to P.

The same holds for a crash after the last write but before the success
line: the journal is still PREPARED, the destinations already equal P, and a
rerun rewrites the same bytes and reports success.

**Limits, stated rather than solved.**

- An interruption that damages filesystem metadata (a destination's size or
  cluster chain) makes the rerun's preflight fail with "target unavailable".
  What the player can do then is `DECISIONS-NEEDED.md`'s first open entry.
- A destination changed by a *foreign* writer after the crash (retail DoK, a
  save editor) is overwritten with its preimage. `/R` cannot tell that apart
  from a torn write. Whether it should is logged as a decision with a step-7
  deadline (`DECISIONS-NEEDED.md`, 2026-09-23).

## Producer protocol (G4) — normative for plan step 7

1. The journaling form is `CCHOST /D <effect> <roster> /T <token> /S <save-dir>`.
   All four are canonical absolute paths. The legacy two-path `/D` stays as
   explicit, *unjournaled* compatibility. Step 7 decides what `/D ... /T`
   without `/S` means.

   **Amended 2026-09-23 (checkpoint 3, from the GBBOOT capacity survey): drop
   `/T <token>` from the journaling form.**
   - The token path becomes the separator-aware `.DOP` sibling of `<effect>`,
     the same rule `.GBS` already uses. CCBIND `/N` mints the token at exactly
     that name, so a caller that builds and passes it separately adds nothing.
     It costs GBBOOT static code and part of the 127-byte DOS command tail,
     and a full command tail is a recurring failure in this project.
   - The journal keeps its +256 field. Step 7 adds a reader check that +256
     equals the `.DOP` sibling of +32, so the field is a verified binding and
     not an independent input.
   - **Caveat that step 7 must close.** CCBIND's `operation_name` and
     `side_name` are *not* separator-aware: they replace from the last `.`
     anywhere in the path. CCHOST's derivations (`build_damage_journal_path`,
     `make_damage_side_name`) are. The two agree whenever the effect's final
     component has an extension, and GBBOOT's effect names do. They disagree
     for a path like `X:\A.B\EFFECT`. Step 7 must make CCBIND
     separator-aware too (CCBIND has 62,217 free) *or* make CCHOST reject any
     effect path whose two derivations differ. Never leave two rules that can
     name different tokens.
   - Whether the save directory arrives as an explicit `/S <dir>` or is
     derived inside CCHOST is **not** settled here. See the plan, §10. It is
     settled at the checkpoint before step 7's brief. The format is the same
     either way.
2. Delete any stale `.GDN`.
3. Handle an existing `.GDJ` as follows:
   - Absent: proceed.
   - COMMITTED with generation **<** the token's: replaceable.
   - COMMITTED with generation **>=** the token's: refuse as already applied,
     with zero writes. This is the exactly-once receipt.
   - PREPARED with generation **==** the token's, where every destination
     currently equals its retained preimage (the whole GBPR, plus each present
     source's raw 216 bytes): replaceable. This is the state after `/R`, or
     after a crash before the first sink write.
   - Any other PREPARED journal, or an unreadable or malformed one: refuse
     with "recovery required" and zero writes.
4. The existing read-only preflight pass completes.
5. Write the complete journal to `.GDN` and close it. Closing is the durability
   point; INT 21h/68h before the close is optional. Delete the old `.GDJ` if
   there is one, then rename `.GDN` to `.GDJ` (INT 21h/56h). A crash in this
   window leaves the destinations untouched and a `.GDN` that nothing reads.
6. Run the write passes and close every sink.
7. Open `.GDJ` read/write, seek to offset 6, write the u16 `1`, and close. This
   single 2-byte write inside one sector is the commit point.
8. Report applied.

A crash before step 7 leaves PREPARED. `/R` then restores the preimages, and a
`/D` retry with the same token applies the damage once. A crash after step 7
leaves COMMITTED. `/R` is then a no-op, and a `/D` retry with that token is
refused. `CCBIND /N` must refuse to mint while a PREPARED journal is
outstanding (plan step 9).

### Amended 2026-09-23 (checkpoint 5, for plan step 7) — supersedes the items it names

Reasoning: plan §14.3-§14.4. Where this block and the list above disagree,
this block wins.

**A. Argument form (settles item 1).** The journaling form is
`CCHOST /D <effect> <roster> /J`.

- `<effect>` and `<roster>` must both pass `validate_absolute_path`
  (canonical, G3). If either fails, the result is the argument error.
- `/J` and `/T` are mutually exclusive. The legacy two-path `/D` and the
  `/D … /T <token>` form stay as they are, **unjournaled**.
- **Token path.** This is the separator-aware `.DOP` sibling of `<effect>`,
  using the same rule as `make_damage_side_name`. An effect whose final
  component has no extension is an argument error.
  - This settles the CCBIND caveat without touching CCBIND.
  - The two derivation rules disagree only when the final component has no
    `.`. CCHOST rejects every such path, so no accepted input can have two
    token names.
- **Save directory.** CCHOST derives it once at parse time and never takes it
  as an argument (option s2):
  - the drive comes from INT 21h/19h, and the path from INT 21h/47h (DL = 0);
  - the result is `X:\` + cwd + `\SAVE`, or `X:\SAVE` when the cwd is the
    root. 47h returns no leading `\`, and returns an empty string at the root;
  - the result must pass `validate_absolute_path` and be at most 98
    characters. Otherwise it is the argument error.

  The legacy write path keeps writing `SAVE\CHRDATA<n>.GAM` relative to the
  cwd. That is the same file as `<derived>\CHRDATA<n>.GAM` by construction,
  because CCHOST never changes directory. The plan §12.6 survey confirmed
  that GBBOOT's EXEC leaves the cwd on the game root.

**B. New reader rule, all states.** Field +256 must equal the
separator-aware `.DOP` sibling of field +32, byte for byte up to the NUL.

- It is a pure string check that opens no file, so check-order rules 1 and 2
  are unaffected.
- A mismatch is a reader rejection (`(result)`).

**C. Replacement table, corrected (supersedes item 3).** The old table
compared generations across token files. That is wrong in this engine: GBBOOT
hands `/D` at least three effect stems (`_GBECL`, `_GBEVT`, `_GBRES`; plan
§14.3). Each stem has its own `.DOP` counter, and the journal is one file per
roster. Generations are comparable **only between equal token paths**.

`/D /J` decides on an existing `.GDJ` **before** it deletes any stale `.GDN`,
before the effect scan, and before any write. Every refusal row therefore
has zero writes, including to a stale `.GDN`.

| Existing `.GDJ` | Condition | Action |
|---|---|---|
| absent (open fails with AX=2) | | proceed |
| unopenable for any other reason, or rejected by the reader | | refuse: `recovery required` |
| COMMITTED | +256 ≠ this token path | replaceable |
| COMMITTED | +256 = this token path, generation < token's | replaceable |
| COMMITTED | +256 = this token path, generation = token's | `already committed`, exit 0, zero writes |
| COMMITTED | +256 = this token path, generation > token's | refuse: `(result)` (the token went backwards) |
| PREPARED | +32 ≠ this `<effect>` | refuse: `recovery required` |
| PREPARED | +32 = this `<effect>` | **7a:** refuse: `recovery required`. **7b:** run the full `/R` path (reader incl. token generation and G6, preflight, restore). On success, proceed; on failure, emit `/R`'s own diagnostic and exit 1. |

- "Rejected by the reader" means `recover_damage_journal` fails in its
  validate-only mode (see D).
- A COMMITTED journal is validated by the same reader before any row is
  applied.
- The 7b row replaces the old "every destination currently equals its
  retained preimage" test. Restore makes that condition true. It also
  accepts a torn destination, which is exactly the post-crash state.

**Known limit.** The receipt covers the most recent operation per roster
only. Suppose operation B's COMMITTED journal is replaced by operation A's,
and B is later retried with B's own old token. That retry is not detected.
GBBOOT never retries an older effect, because each `/D` follows its own
mint.

**D. Producer order (supersedes items 2 and 4-8).**

1. Parse `/J` (A). Validate the derived token with `validate_damage_token`.
   A missing or invalid token is `(result)`, with zero writes.
2. Decide on an existing `.GDJ` (C).
3. Delete a stale `.GDN` with 41h. AX=2 is not an error; any other failure
   is `(result)`.
4. Run the existing read-only preflight scan of `apply_effect_damage_roster`,
   accumulating the **target mask**:
   - an event whose target is 0 ("all") contributes every ordinal below the
     roster count;
   - an event whose target is t (1..6) contributes bit t−1 only if t ≤ the
     roster count;
   - an event that is skipped, or whose damage value is 0, contributes
     nothing.
5. At the end of the preflight pass: **if the mask is 0, write no journal**,
   and continue as legacy `/D`, which writes nothing. Otherwise:
   - build the journal in memory:
     - the GBPR preimage, read in full from `<roster>`;
     - a present entry for each targeted ordinal whose member slot byte is
       1..6, read through `<derived save dir>\CHRDATA<slot>.GAM` (exactly 216
       bytes). The slot comes from the preimage's member record, never from
       the ordinal;
     - absent entries all zero;
     - the header fields from the scan;
   - run the reader's in-memory validators (`damage_journal_validate_roster`,
     `damage_journal_validate_sources`). A failure here, including a non-DoK
     roster, is `(result)` with zero writes;
   - create the `.GDN` with 3Ch and write the header, GBPR, source table,
     then stream the exact effect and GBSL bytes from the files being
     applied. Check CF and AX == the requested length on every write. Close
     it, checking CF. Any failure: close, delete the `.GDN`, `(result)`, zero
     sink writes;
   - **self-verify:** run the reader in validate-only mode (every check
     through G6, then close, with no preflight and no restore) against the
     `.GDN`. A rejection deletes the `.GDN` and is `(result)` with zero sink
     writes. **A journal the reader would reject is never renamed into
     place;**
   - delete the old `.GDJ` (41h; AX=2 is fine), then rename `.GDN` →
     `.GDJ` (56h; ES = DS).
6. The write pass (the unchanged legacy code).
7. Commit: open the `.GDJ` with 3D02h, seek with 4200h to 6, write the u16
   `1`, and require CF clear and AX = 2. Close it, checking CF. The stored
   bytes change from `00 00` to `01 00`, so exactly one byte changes.
8. Print `CCHOST: effect damage applied` and exit 0.

**E. `/D /J` diagnostics.**

| Outcome | Line | Exit |
|---|---|---|
| Argument error | `CCHOST: invalid host request (arguments)` | 1 |
| Any rejection before the rename | `CCHOST: invalid host request (result)` | 1 |
| Existing journal not replaceable | `CCHOST: effect damage recovery required` (new) | 1 |
| Same operation already committed | `CCHOST: effect damage already committed` | 0 |
| Any failure after the rename | `CCHOST: effect damage incomplete` (new) | 1 |
| 7b auto-recovery failures | `/R`'s own `target unavailable` / `recovery incomplete` | 1 |
| Applied and committed | `CCHOST: effect damage applied` | 0 |

A failure after the rename leaves a PREPARED journal. Some sinks may be
written. The remedy is `/R`, or (7b) a same-token `/D` retry.

**F. The v1 producer's write set is pinned.** For each targeted member, `/D`
writes only:

- the GBPR words at member offset +1+216+4 (flags, OR 2) and +1+216+6 (HP);
- source bytes 40 and 214 (the low byte of the new HP).

Any future change to that set is a spec change, because a later
destination guard may depend on it (see G).

**G. Extension rule (keeps the post-image question open; plan §14.4).**
Flags bit `0002h` is reserved for an optional post-image section.

- v1 producers write flags = 1 exactly, and readers reject any other value
  (already true).
- Any optional section is appended **after** the GBSL. When its flag bit is
  set, it extends the exact-EOF formula by its own extent. No existing offset
  moves.
- A reader that understands the bit must keep accepting flags = 1 journals.

**H. `CCBIND /N` refuse-mint is withdrawn (supersedes the last sentence
above).**

- CCBIND runs *after* CCECL has already republished the effect, so a refusal
  there comes too late to protect G6.
- Nothing prevents a lock except running `/R` before the first CCECL exec.
  That is a plan step 9 obligation on GBBOOT.
- `/D /J`'s own refusal (C) is what protects the preimages.
- `/N` stays `source effect` and never needs the roster.

**I. 7b auto-recovery: routing and diagnostics (checkpoint 10, 2026-09-23;
narrows C's last row and E's "7b" row).**

- **Routing.** When the existing `.GDJ`'s peeked state word is PREPARED,
  `/D /J` compares header +32 with `<effect>` byte for byte, before any
  validation. This is a routing decision only. On a mismatch the row is
  C's `recovery required`, as before. On a match (internally "kind 4"),
  `/D` runs `recover_damage_journal` in production mode: every reader check
  including amendment B, the token generation equality and G6, then
  preflight, then restore. It runs before the effect is opened, so the
  handle peak equals `/R`'s.
- **Success.** `/D` continues at C's "replaceable" point: it deletes a stale
  `.GDN` and then runs the D producer. The producer reads the restored P
  fresh, and its rename retires the PREPARED journal.
- **Failure diagnostics** (each exits 1, and no sink is written beyond what
  the failed restore itself wrote):

  | Recovery failure | Line |
  |---|---|
  | preflight | `CCHOST: effect damage recovery target unavailable` |
  | restore | `CCHOST: effect damage recovery incomplete` |
  | anything the reader rejects (including a token generation ≠ the journal's, and a changed effect) | `CCHOST: effect damage recovery required` |

  This differs from `/R` on purpose. `/R` prints `(result)` for a reader
  rejection, because it has nothing else to report. For `/D`, every reader
  rejection means the same thing, "a journal blocks this operation", so it
  keeps one line. C's "emit `/R`'s own diagnostic" means the two I/O lines
  above and nothing more.
- **Lifecycle note (not a rule change).** `/R` never retires a PREPARED
  journal it restored. Only a later successful `/D /J` replaces it. With a
  caller that re-mints the token before retrying, this locks the party.
  See plan §20.4 and `DECISIONS-NEEDED.md` ("roll back or roll forward").
  Step 9 must not ship until that decision is made.
  *(Checkpoint 11/12: decided as roll-back; amendment J adds the retire.)*

**J. Absent journal, and retire on `/R` success (checkpoint 12, 2026-09-23;
normative for plan step 7c; IMPLEMENTED, plan step 7c).** Plan §22.3 and
§22.5 are the full design.

- **J.1: absent journal.** When `/R`'s open (`3D00h`) of the `.GDJ` fails
  with AX = 2, `/R` prints `CCHOST: effect damage journal absent` and exits
  **0**, with zero writes. Any other open error stays `(result)`, exit 1.
  - This is safe because the producer writes no sink until the `.GDN` →
    `.GDJ` rename has succeeded.
  - So no `.GDJ` means no torn destination, even when a stale `.GDN` exists.
    `/R` leaves that `.GDN` alone.
- **J.2: retire.** After a successful PREPARED restore, and only in `/R`
  (not in `/D`'s kind-4 path, whose producer rename already replaces the
  journal), `/R`:
  - deletes the `.GDJ`;
  - then proves it gone by re-opening it, requiring AX = 2.
  - **Success:** `CCHOST: effect damage recovered`, exit 0.
  - **Failure:** `CCHOST: effect damage recovered, journal not retired`,
    exit 1. The restore stands, and `/R` is re-runnable.
  - A crash between the restore and the delete repeats an idempotent
    restore at the next `/R`.
  - COMMITTED journals are never retired.
  - This supersedes "never deletes the journal" in "States and recovery",
    for PREPARED-after-restore only.
- **Resulting `/R` exit contract for a caller (plan step 9):** exit 0 means
  absent, recovered or already committed, i.e. proceed. Exit 1 means the
  party is locked, and the child has printed why.

**K. One-argument `/R` derives the save directory (checkpoint 15,
2026-09-23; IMPLEMENTED, plan step 9a; verified at checkpoint 16, plan
§28).** Plan §27.5
is the full design.

- **Syntax.** `CCHOST /R <roster>` with no second argument derives the save
  directory by calling `damage_journal_derive_save_dir`. That is the same
  routine, and the same G2 98-character bound, that `/D /J` used to record
  the journal's source-dir field: `X:\<cwd>\SAVE`, via INT 21h 19h + 47h.
- **Two-argument form.** `CCHOST /R <roster> <savedir>` is unchanged.
- **Unchanged guarantees.**
  - The roster is still `validate_absolute_path`-checked.
  - The derived directory must still equal the journal's recorded source
    dir. A mismatch fails closed as `(result)` with zero writes.
- **Why a derived directory is correct for the one caller that uses it.**
  GBBOOT runs `/R` at boot and `/D /J` at `.ecl_return` from the same
  process context, with no chdir in between. This also keeps GBBOOT from
  composing a save path, which costs it bytes and would be a second copy of
  the G2 rules.
- **Scope.** DoK only, like `/J`. GBBOOT gates both on `game_dok`.

**L. The GBBOOT caller (checkpoints 15–18, 2026-09-23; IMPLEMENTED, plan step
9).** Plan §27.5, §28.5, §29 and §30 are the full design and evidence.

- **Boot recovery.** In `run_native_preview`, directly after `call
  shrink_mem` and before the `checkpoint_load` branch (so it also covers
  `/5` camp loads), a DoK-only block runs `CCHOST /R <roster>` (the
  one-argument form of amendment K), with the roster in long `X:\NAME`
  form. `/R` must follow `shrink_mem`, because EXEC needs the shrunk
  block (GM4).
- **Exit contract.** Exit 0 (absent, recovered and retired, or already
  committed) continues the boot. Exit 1 reaches `.nativefail`: CCHOST's
  own line, then `GBBOOT: native preview failed; gate 35`, then DOS exit
  code 3. This is the interim "block and explain" default. The `.GDJ`
  path is not printed.
- **Direct DAMAGE.** `apply_sidecar_damage_roster` builds
  `/D <effect> <roster>` with both paths in long form
  (`tail_append_str`; the short-root `X:NAME` form fails `/J`'s G3 check,
  GM5) and appends ` /J` for DoK only. It shares the `host_tail_exec`
  tail-call exit with the boot `/R`.
- **Token minting.** GBBOOT's effect binding is now `CCBIND /N`
  (`s_bind_write`), which writes a `.DOP` operation token beside every
  effect stem, for every title.
- **Scope.** CoK and DQK direct DAMAGE stay unjournaled (G8;
  `DECISIONS-NEEDED.md`). GBDJ makes one interrupted direct-DAMAGE write
  recoverable. It does **not** make a GBBOOT session crash-safe: a crash
  still rolls the world back to the last camp, while completed damage
  stays applied.
- **Test surface.** `native/gbdok-journal-flow-test.ps1` (flow roster
  36) drives GBBOOT through five sessions: a zero-mask capture with its
  null, a produced COMMITTED journal via a stub CCFLOW replaying the
  captured effect plus one DAMAGE record, a crash-build interruption, a
  boot-time recovery ending byte-identical to session 1, and a locked
  party stopping at gate 35 before ECL runs.
- **Mutation coverage.** GM1–GM5, GM7 and TM1 are caught. GM2
  (`/N` → `/W`) has two witnesses: the journal flow and, after plan
  §30.3's `.DOP` cleanup, `gbdok-flow-test.ps1`. Without that cleanup, a
  stale `.DOP` masks it, and in a lived-in install GM2 would silently
  turn later damage into `already committed`. GM6 (` /J` for every title)
  and GM8 (boot `/R` for every title) are **not equivalent and not caught
  anywhere in the 36-script suite**; they are deferred as low-severity,
  loud failure modes (plan §30.2).
- **Capacity.** GBBOOT 64,844 / 65,100 / 180 free (+44); CCHOST 21,417 /
  43,607 free (amendment K, +20).

## Scope (G8)

The journal covers compact DoK only. CoK direct DAMAGE
(`write_cok_save_result`) is **not** journaled. Never describe CoK direct DAMAGE
as crash-recoverable. Whether it should become so is logged in
`DECISIONS-NEEDED.md`.

## Implementation status (2026-09-23, updated again for step 9)

- Reader: complete through G6 (`e6c62ba3`, flow sweep `c3902d44`). COMMITTED
  returns success. PREPARED still always fails closed.
- Destination preflight: **DONE (plan step 5)**. `damage_journal_preflight`
  runs on the PREPARED path only after every reader check (including G6)
  passes, with the journal closed first. It opens the roster and every
  present source's destination read/write, size-checks each, and rewinds to
  0, leaving the handles open for step 6. Failure prints
  `CCHOST: effect damage recovery target unavailable`, distinct from the
  reader's `(result)` diagnostic. No write path exists; PREPARED still always
  ends fail-closed in every build, including after a successful preflight.
  Full fixture/mutation results: plan §11.
- Restore: **DONE (plan step 6, 2026-09-23)**. `damage_journal_restore` and
  `damage_journal_restore_unit` write the preflighted units (roster, then
  present sources in ordinal order) through the retained handles, seeking to
  0 explicitly and verifying CF clear plus AX == the requested length on
  every write; every handle is closed and reset to `0FFFFh` on both success
  and failure. Normative contract: the "Restore" section above. 13 required
  mutations (RM1-RM13) were run against real DOSBox measurements; all
  results matched or were explained by the pinned check/iteration order (no
  mutation revealed a missing check). Capacity unchanged at 18,709 emitted /
  18,965 resident / 46,315 free. Full results: plan §13.
  - **Checkpoint 5 corrections (2026-09-23).**
    - "Capacity unchanged" is relative to the uncommitted pre-test build.
      Against step 5's committed 18,422 / 18,678 / 46,602, restore costs
      **+287** emitted and resident.
    - RM6 was masked by the brief's own hook design, not by a gap in the
      code. `FAIL_AT` injects AX = 5, so the AX == length check fails it
      either way. Step 7a changes the hook to inject AX = the requested
      length and re-runs RM6 (plan §14.2).
    - The "Reader … PREPARED still always fails closed" bullet above predates
      step 6. A valid PREPARED journal now restores.
- Producer: **DONE (plan step 7a, 2026-09-23)**. `CCHOST /D <effect> <roster>
  /J` now journals compact-DoK direct DAMAGE end to end.
  - **Command-line handling:** `parse_args .damage` accepts `/J` in place of
    `/T <token>` (never both). Under `/J` it validates `effectpath` and
    `rosterpath` as absolute, derives `damage_tokenpath` with a new
    separator-aware `.DOP`-sibling routine, derives `damage_source_dir` via
    INT 21h/19h+47h (the `SAVE` directory), and sets `damage_journal_mode`.
  - **The existing-journal decision:** amendment C. A structurally valid
    COMMITTED journal for the same effect and token path is "already
    committed" (zero writes) when its generation equals the token's,
    replaceable when lower, and `(result)` when higher. A different effect
    or token path is replaceable. *(Corrected at checkpoint 10. This used to
    say "lower or equal-generation … already committed", contrary to both
    the code and C.)* A PREPARED journal at the 7a step always
    refuses with "recovery required" (7b replaces this row with
    auto-recovery); everything else that is safely replaceable has its stale
    `.GDN` deleted before the new journal is built.
  - **Journal build and write:** the preflight scan notes the OR'd target
    mask (or "all") immediately before each damage application; at
    `.scan_done`, `damage_journal_produce` builds the header/roster/sources
    image from the preimages, filters the mask by the roster's real member
    count, opens and validates each present source, writes the whole image to
    a `.GDN` temp file through one write helper (CF and AX == requested
    length, refusing CX = 0), self-verifies it via the reader's own
    `validate_only` path, deletes any old `.GDJ`, and renames `.GDN` into
    place.
  - **The commit.** After the unchanged legacy write pass returns CF clear,
    a single 2-byte write flips the journal to COMMITTED (state 1) and
    `applied` is printed. A CF after the journal went live prints the new
    `CCHOST: effect damage incomplete`.
  - **Diagnostics:** `applied`, `already committed`, `recovery required`,
    `incomplete`, and the existing `(result)`/`(arguments)` strings.
  - **Defects:** D1-D7, all fixed (plan §15.3, §16.2, §17.2).
  - **Capacity:** CCHOST 21,128 emitted / 21,384 resident / 43,896 free,
    source hash `7ecd8135…` — +2,419 emitted over step 6's 18,709. GBBOOT,
    CCCOMBAT and CCECL are unchanged.
  - **The harness:** the new `$gbdpRun` GBDP session in
    `native/cchost-test.ps1` covers the DP/DR/DA non-fault cases and the
    PK/PF/PW/PV/PL/PG crash/fault half; the pre-existing GBDJ session gains
    the GJDOP reader case (the +256 `.DOP`-sibling rule).
  - **The mutation round:** 34 mutations run, 31 caught; JM11, JM20 and JM26
    are backstopped rather than caught (plan §18).
  - **Known gap, closed by 7b A4.** PK7's "destination byte- and
    mtime-unchanged by `/R`" check did not assert mtime, because the
    crash/retry/`/R` sequence shared one DOSBox session with no host-side
    snapshot point. 7b restructured the PK rows around a second session
    (amendment I / A4), and the mtime assertion now runs.
- **Auto-recovery: DONE (plan step 7b, 2026-09-23).** A PREPARED journal
  whose header +32 matches the request (kind 4, amendment I) is now
  auto-recovered inside `/D /J` instead of being refused outright.
  - **A1 (routing).** `damage_journal_check_existing`'s PREPARED branch
    compares header +32 with `<effect>` and routes a match to kind 4,
    leaving a mismatch on the existing kind-1 `recovery required` path.
    The compare is a routing decision only; the full reader still validates
    a kind-4 journal before anything is trusted.
  - **A2 (`.journal_auto_recover`).** On kind 4, `/D /J` runs
    `recover_damage_journal` in full production mode: the reader (including
    the token generation check and G6), then preflight, then restore. On
    success it proceeds at C's "replaceable" point and the producer
    re-produces a fresh journal over the restored preimage. On failure it
    reuses `/R`'s two I/O diagnostics
    (`CCHOST: effect damage recovery target unavailable` /
    `CCHOST: effect damage recovery incomplete`) or, for any reader
    rejection, `CCHOST: effect damage recovery required` — three existing
    strings, none added.
  - **A3.** The `CCHOST_TEST_GBDJ_HOLD_HANDLES` hold/release wraps only the
    recovery call, so the harness can measure the auto-recovery handle peak
    (a new `PH8` build) without perturbing the producer's own later opens.
  - **A4.** PK7's mtime check now runs across two DOSBox sessions: session 1
    leaves PK7 and a new write-oracle control, PK7C, in their post-crash
    states; session 2 re-opens each and re-asserts. PK7 must show every
    file and directory byte- and mtime-unchanged; PK7C must move, proving
    the instrument is not blind. This closes 7a's known gap above.
  - **Harness.** 13 new rows (PK3D, PK4D, PK5D, PK6D, PF1D, PKR, PKF, DR10,
    DR11, DR12, DR13, DRH8, PK7C) plus a rebuilt DR6 (its `.GDJ` is now the
    case's own `PreparedJournalBytes`, so it exercises kind 4 rather than
    the old "replaceable" row).
  - **The mutation round: 9 of 9 caught** (JB1-JB8 and JM13′, plan §22.1).
    `M0` (deleting the redundant `validate_only = 0` store at
    `.journal_auto_recover`) was confirmed a true equivalent mutant, not a
    coverage hole, and is recorded as the round's null rather than a miss.
  - **Capacity:** CCHOST 21,210 emitted / 43,814 free (+82 over 7a's
    21,128 / 43,896). GBBOOT, CCCOMBAT and CCECL are unchanged.
- **Absent journal and retirement: DONE (plan step 7c, 2026-09-23).**
  - **J.1.** `/R`'s `.GDJ` open failing with AX = 2 (only) now prints
    `CCHOST: effect damage journal absent` and exits 0 with zero writes; any
    other open error still prints `(result)` and exits 1.
  - **J.2.** After a successful PREPARED restore, `/R` calls the new
    `damage_journal_retire` (in `recover_damage`'s `.not_committed` branch
    only, never in `recover_damage_journal`, which the kind-4 `/D` path and
    the COMMITTED validate/self-verify also share): it deletes the `.GDJ`,
    then proves the delete by re-opening it, requiring AX = 2. Success keeps
    `CCHOST: effect damage recovered`, exit 0. A journal that survives the
    delete prints `CCHOST: effect damage recovered, journal not retired` and
    exits 1, leaving `/R` re-runnable. COMMITTED journals are never retired.
  - **No entry reset.** `damage_journal_absent` is not reset at the start of
    `recover_damage_journal`; the flag's only writer is the `cmp ax,2` /
    `mov …,1` pair after the failed open, and 7c.2's JC8 mutation (deleting a
    reset that a draft of the code had added) confirmed a reset would be an
    equivalent mutant.
  - **The flips** (§22.5's table as corrected by §24.3): every GBDR/GBDP row
    that runs `/R` a second time after a successful restore now reports
    `journal absent` (not `recovered`) on that second call, and the `.GDJ` is
    absent afterward instead of unchanged — `RS01`-`RS05` `_R2`;
    `RK0/1/3/7/E`, `RT0/4`, `RF0/5`, `RW2` `_RUN3`; every row asserting the
    journal kept/unchanged after a successful `/R` (including `RH8`); DR12's
    final (`R.GDJ` now absent, not F's PREPARED); the `/R`-follow-up finals in
    PK4/PK5/PK6/PF1/PL (absent, not PREPARED). PK3's final is unchanged (its
    `/D` now sees no journal and applies); PW1/PK7's COMMITTED `/R` and any
    `/R` inside an ACCEPT_MARK build are unchanged. §24.3 found two more not
    in the original table: D1P (not previously listed), and GJ01/GJ01P
    (`-SkipJournal` fixtures, including the marker build) now also read
    `journal absent`/OK, because the absent dispatch sits ahead of
    `.reader_ok`. The GBDR whole-tree directory-mtime pin is now per-path,
    exempting only the 16 retired case directories (deleting a case's `.GDJ`
    moves that directory's mtime); every other directory stays pinned.
  - **New rows.** RN0 (no `.GDJ`/`.GDN` at all: absent, OK, zero writes); RN2
    (the PK2 `D_CRASH=2` state, `.GDJ` deleted/`.GDN` present: absent, OK,
    `.GDN` untouched); RN3 (roster path in a non-existent directory: DOSBox
    answers AX ≠ 2, so `(result)`/BAD, and J.1's AX discriminator is
    observable); RRO (a PREPARED journal with a host-read-only `.GDJ`:
    restore succeeds but the delete fails, `recovered, journal not retired`,
    BAD, destinations = the restored preimage, `.GDJ` byte-identical); RRT
    (crash → `/R` → `/R` → `/D /J`: `recovered` OK, then `journal absent` OK,
    then `applied` OK, ending COMMITTED — the step-9 happy path end to end).
  - **The mutation round (plan §25.1).** JC1-JC6 all caught at their
    predicted row (skip-the-retire, retire-on-COMMITTED, ignore the
    verify-open, drop the `cmp ax,2` discriminator, retire-before-restore,
    and a wrong exit code on the absent path). JC7 (test the absent flag
    after preflight/restore-bad) and JC8 (the entry reset) are both
    equivalent mutants, per the flags being mutually exclusive by
    construction; JC8's equivalence was acted on by removing the reset
    permanently. JC5 (retire before the restore, rather than after) is a
    witnessed data-loss class, not merely a predicted red: with a scratchpad
    copy of the harness, RS01\_R1 and RK1\_RUN2 both read `journal absent`/OK
    while their destinations are provably never restored — the CRASH_AT=1
    fixture run is itself a `/R`, and deleting the journal ahead of the
    reader destroys recoverability permanently. This is exactly the class
    J.2's placement (after the restore, verified by re-open) exists to
    prevent.
  - **Capacity:** CCHOST 21,397 emitted / 21,653 resident / 43,627 free
    (+187 over 7b's 21,210/43,814). GBBOOT (224 free), CCCOMBAT (260 free)
    and CCECL (81 free) are all unchanged.
- **Step 9a (amendment K): IMPLEMENTED** (committed with step 9).
  `parse_args .recovery` gains a NUL/CR test after the roster's
  `validate_absolute_path`. The diff is a pure 14-line insertion, so the
  two-argument path is byte-for-byte untouched. Harness: D1H flipped `(arguments)`/BAD -> `journal absent`/OK;
  new rows D1Q, D1R (GBDJ session) and RD0, RD1, RD1T, RD2 (GBDP session).
  Capacity: CCHOST 21,417 emitted / 21,673 resident / 43,607 free (+20);
  GBBOOT 224, CCCOMBAT 260, CCECL 81 free, unchanged. Checkpoint 16
  re-derived all of it and added a validate-then-discard mutant (KM5),
  caught by RJVMRK. Details: plan §28.
- **GBBOOT caller: DONE (plan step 9, 2026-09-23).** See amendment L.
  Release-gated: not in a packaged release until the relative-binding
  decision is answered.

### Superseded status (2026-09-22)

- Reader: structural checks, D1 and D2 fixed (`b38fc0b3`). D3, the G5
  cross-field checks, canonical-path rules, COMMITTED, and current-file
  comparison: plan step 4.
- Destination preflight: step 5. Restore: step 6.
- Producer: step 7. GBBOOT caller: step 9.
