# CoK cold Add: observed party state

Date: 2026-10-15. Status: bounded cold-process character insertion accepted;
complete M1/M2, View and campaign acceptance remain open.

## Actual run

Luna ran the archived WORLD/WHO/volume executable in headless mode against a
fresh isolated copy of the previously saved KRA.WHO and KRA.SFX. Original assets
and accepted saves were unchanged. Evidence directory:
`build/cok-recomp/staging/intro-compare/cold-add-world-volume-headless-run-luna-20261015-a`.
Executable SHA256:
`49222fe31e36f16ded6d4403babaf431ab8b2b7d7ad0122964c3a5e25fa8c4bc`.

The reviewed route selected Add, selected KRA, observed the loading message and
the marked `* KRA` entry, then selected Exit to return to the main menu. Root
reviewed the original-resolution captures before subsequent input. Frame0017
shows KRA in the party with AC10 and HP12. Its SHA256 is
`889d62d63eca138234a460459de0f6676771961f6ebf65dc5cc909fb54bea619`.
No View, Save Current Game or Begin Adventuring action was taken.

The seven BIOS words were 7181,6480,20480,7181,7181,19712,7181. The terminal
records work17750000, head/tail44, fault0, headless=true and window_created=false.
The retained guest process51336 exited0, output drained, without forced
termination. This was an orderly observation close; run_completed=false does
not represent a campaign ending. Both writable save files retained their input
hashes. The offline publication validator process50292 exited0 with empty
stderr. Its execution receipt and raw streams are retained. The earlier
terminal's publication_verified=false predates this separate validation and
has not been rewritten to manufacture an acceptance result.

## Direct memory evidence

Root's `root-ram-character-comparison.json` records the final byte comparison.
Final RAM SHA256:
`3957c4c1e3bb768911052dc86b62f14a0eac906ff5ed666f3ee6b81d63aae8d7`.
Endpoint DS=1BC6 and SS=2491; these are distinct segment roles.

Party head and current character both point to6109:0000. The party structure
at5111:0000 has count1, the character's next pointer is null, and its Pascal
name starts03-4B-52-41 (KRA). Of the409 WHO-derived character bytes,406 match
the accepted file exactly. The three differences are:

| Character offset | Serialized byte | Final RAM byte |
| --- | --- | --- |
| 00D6 | 00 | 01 |
| 00E5 | 51 | 4C |
| 0137 | 0A | 00 |

The zero at0137 is consistent with first-slot insertion. The E3/E5 far pointer
is5B4C:0000; the nine bytes there exactly match accepted KRA.SFX,
`5f0000ff0000000000`. Subsequent
[original-source reconstruction](cok-cold-add-source-reconstruction-2026-10-15.md)
identifies E3/E5 as the rebuilt SFX-list head,0137 as first-free-party-slot
assignment and D6 as a conditional signed-byte maximum update over F9..100.
Root separately checked the original pointer/D6/slot store bytes and final
F9..100 values01,00,00,00,00,00,00,00. These source rules explain the observed
differences conditionally; they do not constitute a dynamic instruction trace
or establish a broader game-field name for D6.

## Scope and next gate

The visible party row, singleton linkage, character bytes, matching linked
sidecar content and fault-free controlled close establish cold Add state.
The compact journal does not expose actual DOS open/read callbacks. Therefore
this run does not establish requested/returned WHO409, STF63 or SFX9 read counts,
read order, EOF behavior or a missing sidecar's handling. Existing host tests
cannot retroactively supply those runtime observations.

The subsequent optional bounded
[DOS audit companion](cok-dos-audit-companion-plan-2026-10-15.md) now has actual
native and headless OFF/window-ON acceptance. Its repeated KRA route preserves
RAM/registers/BIOS/saves and verifies full WHO409/SFX9 reads and SFX EOF against
pinned source bytes; see
[actual v3 audit validation](cok-dos-audit-native-validation-2026-10-15.md).
That later run supplies transfer observations; the earlier process above remains
a separate state observation without a DOS ledger. Production audit integration
is still open. The subsequent
[DWF2 reload](cok-dwf2-cold-reload-acceptance-2026-10-15.md) now passes with
its longer three-record sidecar and independent transfer/memory evidence.
Original View admission requires its separate dispatch/initializer proof.
WORLD gameplay, full party handling, cold world saves, campaign completion and
release packaging remain unverified.
