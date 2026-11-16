# DQK WHO confirmation runtime lane (2026-07-29)

## Outcome

The staged native harness is extended for the requested bounded trace, but the new `Confirm` stage
has **not** yet been executed. Three unrelated ASMQuake DOSBox Staging sessions appeared after fresh
DQK launches. In accordance with the exclusive-session rule, the DQK route stopped without sending
any WHO-form input and reaped only its owned DOSBox-X process.

This memo therefore documents a ready-to-run harness and an exact pending experiment, not new
original-DOS confirmation evidence.

## Exclusivity incidents

The first pre-launch check found no DOSBox-family process. The authentic scratch mount was also
re-verified before launch:

- `build/dqk-auth-oracle-b2/DQK.EXE` SHA-256
  `6B0A9AC5C873997087F1F3F626334A71092FE7C8D1E92CE7F72869A59931F837`.
- `build/dqk-auth-oracle-b2/DISK3/ECL.GLB` SHA-256
  `40542071E42D3CD125EABCEAD11456A99942BF55A7736FDB79F66A3C27C3664D`.

Three disposable launch attempts were then bounded as follows:

1. `build/dqk-who-confirm-r1-20260729/` owned DOSBox-X PID **51508**. Unrelated PID
   **46000** appeared with executable
   `C:\LLM\DOS\cc\dbstaging\dosbox-staging-v0.82.2\dosbox.exe` and an ASMQuake
   `run_aq32hd_headless.conf` command line. The route command was terminated before WHO handoff;
   PID 51508 was identified from `probe-process.json` plus its executable/command line and reaped.
   PID 46000 was not touched.
2. `build/dqk-who-confirm-r2-20260729/` owned DOSBox-X PID **58176**. Unrelated ASMQuake
   DOSBox Staging PID **15700** appeared during probe setup. The strengthened harness detected it,
   threw `native-runtime CONTAMINATION`, and its `finally` block reaped PID 58176. PID 15700 was not
   touched. It remained active when this lane stopped.
3. After PID 15700 exited, the explicitly requested final attempt
   `build/dqk-who-confirm-r3-20260729/` owned DOSBox-X PID **61396**. The route reached the retail
   page-14 `RANGERS` journal prompt and resolved its answer to `use`. Before the typed-word sequence
   could continue, unrelated ASMQuake DOSBox Staging PID **55856** appeared with the same external
   `run_aq32hd_headless.conf` provenance. The all-DOSBox guard threw
   `native-runtime CONTAMINATION`; `finally` reaped PID 61396. A read-only process check proved
   `owned_61396_alive=False`, while PID 55856 remained untouched. No `who-handoff.json` or
   `who-confirm-report.json` exists in the r3 directory.

None of the three attempts reached the staged WHO handoff, sent Down/Enter at WHO, or produced a
`who-confirm-report.json`. The incomplete ignored directories are diagnostic launch artifacts only.

## Harness extension

`tools/dqk-native-control-route.ps1` now accepts `-Stage Confirm`. Starting from a fresh visible-WHO
`Launch -KeepAlive` handoff, it performs exactly two game inputs through focusless GameLink:

1. one authentic **Down** selector movement;
2. one **Enter** confirmation.

For Down it requires and records:

- INT16 helper stop `08FB:006C` and the far-return stack;
- generic dispatcher entry `1D42:00F8` with BIOS `AX=5000`;
- recovered 64-entry table target `1D42:021A`;
- a full `0xA0000` RAM checkpoint, diff, screenshot, and framebuffer SHA-256 after the movement has
  been applied and the original form reaches its next input boundary.

For Enter it requires and records:

- a separate INT16 helper/return-stack boundary;
- generic dispatcher entry `1D42:00F8` with BIOS `AX=1C0D`;
- the not-in-table fallback `1D42:0298`;
- normalized-key writer `13FF:06B8` with `AX=000D`, plus the pre-store contents of `DS:A6B2`;
- accepted event-5 activation at `22CA:174D` **or** the next `08FB:006C` input boundary as an
  explicit re-prompt/non-activation result;
- the resulting original-DOS full-RAM checkpoint, movement-to-confirm diff, screenshot, visible
  text, and framebuffer SHA-256.

Every breakpoint is armed only while the debugger is halted. `BPINT 16 0` is co-armed with the
writer/activation probes where a missed code breakpoint would otherwise leave the guest running.
The owned PID is always reaped in `finally` and the handoff is removed. No `SendKeys`,
`SetForegroundWindow`, `SendInput`, host click, or focus-stealing input path is used.

The ownership guard was also widened from `dosbox-x.exe` to every `dosbox*.exe` process. A foreign
DOSBox-family PID now aborts attribution even if it is DOSBox Staging rather than DOSBox-X.

## Exact pending run

Do not run this while PID 55856 or any other DOSBox-family process exists. Use a new output
directory because the first three are intentionally preserved as incomplete abort evidence. This
command is a future handoff only; the lane stopped after the requested final r3 attempt:

```powershell
pwsh tools/dqk-native-control-route.ps1 `
  -MountDir build/dqk-auth-oracle-b2 `
  -OutDir build/dqk-who-confirm-r4-20260729 `
  -SaveSlot B `
  -EncounterChoice Creep `
  -CreepDirection Left `
  -FollowupEncounterChoice Creep `
  -PortalChoice Wait `
  -StoneChoice Throw `
  -Stage Launch `
  -KeepAlive `
  -MaxSteps 60 `
  -ExclusivityWaitTimeoutSec 5

pwsh tools/dqk-native-control-route.ps1 `
  -MountDir build/dqk-auth-oracle-b2 `
  -OutDir build/dqk-who-confirm-r4-20260729 `
  -Stage Confirm
```

Success is not merely both dispatcher-entry hits. The required closeout artifact is
`build/dqk-who-confirm-r4-20260729/who-confirm-report.json`, corroborated by the named debugger
snapshots, two applied-state RAM diffs, and the final screenshot/checkpoint. The discriminating
question is whether Enter reaches `22CA:174D` and advances beyond WHO, or returns to the WHO input
boundary after storing normalized `000D`.

## Static verification

- PowerShell parser: zero syntax errors for `tools/dqk-native-control-route.ps1`.
- `git diff --check`: clean for the new harness/memo changes (line-ending notices for concurrently
  edited files are warnings, not whitespace errors).
- Prohibited host-input API scan: no `SendKeys`, `SetForegroundWindow`, or `SendInput` invocation in
  the harness.

## Claim boundary

Existing runtime artifacts still prove only the earlier one-Down dispatcher capture at
`1D42:00F8`. This lane adds the executable machinery for a paired Down/Enter trace, but cannot claim
that Enter is accepted, that WHO returns a party member, or that any source ECL state advances until
the exclusive `Confirm` run produces its report and post-confirm state.
