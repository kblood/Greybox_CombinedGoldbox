# Secret Amiga player session and INITIAL admission

Task248 implementation `a17fa3f5` and verified release gates,2026-10-12.
Clean measurements bind integration `dacef80a` to unchanged native source.
Native DOS is primary; task249 execution follows verified commit/push.

## Public route

`native/run-goldbox.ps1 -Profile SecretAmiga -GamePath <Amiga data root>
-SecretDosPath <DOS pregen root>` composes the explicit held DISK1/DISK2 layout
with six supported439-byte DOS pregens and optional STF/SFX companions.
CCPARTY imports the party; PowerShell copies source inputs and never constructs
P1, GSK or OWNER authority. Ordinary Secret DOS-DAX and the13 automatic profile
definitions retain their existing behavior.

Both canonical source roots determine the persistent session identity. Initial
validation precedes persistent creation: supported GLIB headers and pointer
bounds, unique ECL area16 ownership, at most256 ECL pointers and512 bytes of
ID table, decoded area extent20..16000, complete2048-byte catalogue and bounded
pregens/companions. Completion requires the closed five-string record. Existing
complete snapshots reopen without revalidation of changed retail bytes or input
refresh. Relative session roots follow PowerShell's filesystem location.

The fixed private mounts are C: `GREYBOX` and D: the composed game tree, with
CWD `D:\DISK2`. Only26 manifest-named production COMs are copied into C:.
Fresh argv is `/E /! /A16 /9 1`; Resume is `/5 /! /A16 /9 1`. Resume finds an
existing matching completed composition and GSK/GKB/GKT candidate without a
creator. Candidate presence permits native dispatch; CCNEXT owns acceptance.
Missing/mismatched composition, missing candidate and PartyMenu refuse before
staging or build.

`-PrepareOnly` returns the real mounts, config, batch and native marker paths.
The guest batch is DOS8.3 `RUNGB.BAT`. Native nonzero completion writes
`LAUNCH.BAD`; ordinary completion writes `LAUNCH.OK`. A waiting menu has neither
marker. DOSBox process exit alone cannot establish native continuation success.
Luna tests the exact returned config/batch through a separately hashed hidden
GameLink display-only overlay; native argv and state remain unchanged.

## INITIAL repair

Actual public recovery of a genuine PREPARED/kind3 INITIAL with a valid changed
current-party name admitted GREETINGS while the frozen GSK roster still differed.
It did not restore P1. `kn_resume` dispatched unanswered kind3 to READY without
the live-party matcher used by ACTIVE. The committed-answer path already checked
the party, so its existing negative coverage did not expose this earlier gap.

The repair calls existing `kn_match_cursor_roster` with immediate carry rejection
after validated kind3 admission, before mode dispatch, answer probing or READY.
It checks the complete live P1 and exact EOF, and applies the established
GSC/GSJ/GSB exclusion. No party overwrite, original-game arithmetic or transport
revision changes. Legitimate GKB/GKT recovery may publish before this guard;
exact no-write rejection claims use stable admitted live GSK.

Compiled OLD one-case evidence returned READY2 instead of failure1. The broader
absent-answer matrix exposed48 failures and6 already-correct empty/E rejections.
The same single control passes after repair. Final focused746 controls pass in
61.18s, covering ordinary menu/WHO/empty, R/M/E, first/sixth-row immutable changes,
missing/truncated/trailing/malformed P1, absent/present answers, response/output
preservation, no answer probing or producer writes, I/O faults, transaction
exclusion and legitimate recovery. New empty-mode positive assumptions were
corrected against a source-identical frozen OLD binary; failed logs remain.

Only CCNEXT changes, by7 emitted bytes:30868 emitted /31124 resident /34156 free.
The other25 tools remain byte-identical. CCECL68 and GBBOOT489 free retain64/128
floors and14500/16000 input limits. Frozen native SHA256 is
`56aeb961d032aa5ca5d20d07cf608447b0d79d885c6bdce5a5d79d49c88768c4`;
CCNEXT SHA256 is
`f7619132fb9d791c293360d0dfa4aa4331e5aed3ccaf549579abebde88b1e699`.

Luna's exact public INITIAL replay now fails before GREETINGS, writes LAUNCH.BAD
and preserves14/14 already-mutated native artifacts. Full-tree comparison finds
only the expected added16-byte failure marker. Updated ordinary fresh, true
live-process/cold/strict and no-answer reopen controls pass. Live versus cold
changes only successor `_GBRES.DOP` generation2->3; cold E versus strict5 is
26/26 exact. No-answer reopen changes only that generation3->4. All6 updated
negative cases fail with native BAD, preserving their entire14/26 artifact sets.
Source bytes/mtimes and all26 new hashes match across12 staged session trees.
Final clean gates pass44/44 flows and46/46 components at canonical source
SHA256 `73e0076a8702f5abb0093dd86dfccb5aefd7f9fdbd65987ebb089b545ff6dbfd`; start/end and every
script/source pin match. There are zero retail-file writes; known DQK/DoK DOSBOX
directory timestamp changes are recorded separately. Full boot passes248 RESULT
controls. Corpus11,362 passed /1 skipped /84 warnings in717.95s, exit0 (11,363
collected). All26 final binary hashes match the frozen runtime set. Engine3061
/3 skips, typecheck/builds, web189/189, intros10/10, author8/8 and Electron9/9 pass.
Integrated Rust89 and fresh standalone EGA539 also pass. Completed gate logs and
independent44/46/26 audits are retained with the external runtime evidence.

## Evidence and scope

Evidence is retained externally at `C:\temp\GoldBox-task248-20261012`.
The initial long batch-name failure, early stopped reference attempts, native
INITIAL admission failure, failed test assumptions and corrected results remain
separate. Full native-artifact comparisons include GKW banks; counter exceptions
name the entire16-byte GBDO file and exact full64-bit offset8 change.

The verified gameplay entry reaches source-owned menu boundaries using a native
party. Original save restoration, terminal campaign completion and original
Amiga executable parity remain unverified.
