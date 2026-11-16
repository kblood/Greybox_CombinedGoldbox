# Private ENTRY journal installer checkpoint

`entry_install.py` composes the complete current public coordinator, its
existing RR/RV/RC helpers and a private descriptor entry/callable installer.
The build first verifies the public baseline hash and byte equality with the
existing public COM. It retains the approved1120-byte KN/RW path overlay,
separate ITEM112 bytes, existing bank lifetimes and exactly one final512-byte
stack. No production source, dispatch, targets or release enrollment changed.

The separately compiled frozen staging worker remains raw62333/resident62589,
SHA256 `fbd319e1af56e41331a5c8fb64a16de9bbc28057395619bba39dc7922b0a3052`.
Tests produce GRT by executing that worker; no host rename or host-created
positive journal substitutes for its output. Python byte changes are refusal
controls only.

The executable installer reads one448-byte canonical-anchor descriptor,
allocates ordinary banks and calls `ei_invoke` with the actual final resident
extent. The callable contract matches `rc_invoke`: SI=GSK, DI=P1, BX=ECL,
BP=ITEM, DS=ES, FS/GS disjoint, DX=actual extent. It independently admits the
existing GRT as ENTRY/action1/result1/generation0→1/phase0, with RR exact
sections/EOF and RV complete replay. Existing live validators bind the whole
GSK3, P1, ECL, ITEM and workspace OWNER. Eligibility is rechecked. Exact
source-bound GBMO18 must still be present: recovery's absent-token tolerance
is explicitly rejected by the fresh installer. Nine competing siblings and
CAPTURE.GSK must be absent; only independently admitted GRT is allowed, while
unrelated GRA remains untouched. Protected-path disjointness is checked.
Every owned handle must close successfully before the sole GRT→GRJ rename.
Failed-close handles retain ownership and warm calls fail before further IO.

The installer performs no recovery, producer work, READY, answer retirement,
P1 writes, child execution or cleanup. A separate recovery diagnostic COM
changes only its descriptor-wrapper destination to existing
`rcommit_recover4`; it does not add recovery inside `ei_invoke`.

Frozen installer: raw64470/resident64726, PSP256, stack512, ceiling65280,
headroom554, SHA256
`2d378ddf5540747bdeae9f01bd677859485cf376bfba49f68e15ce88a7635d94`.
Separate recovery diagnostic: raw64471/resident64727/headroom553, SHA256
`9415848681d2c2c8ba28a24e09e84cf18ce878534b6571dd7803d5823bd43d89`.
Compile reports precede execution; oversized compositions raise before use.

Focused final command, with a fresh explicit export destination:

```text
SECRET_ENTRY_INSTALL_OUT=C:/temp/GoldBox-task250-entry-install-runtime-20261014
python -m pytest tools/tests/test_secret_reward_entry_install.py tools/tests/test_secret_reward_entry_install_export.py -q --tb=short
```

Initial result:37 passed/40.77s/exit0. The Astra review found that the
`probe-close` fault selector did not distinguish an active `kc_probe_fh` from
the final GRT close. The selector now tags the actual active probe handle,
asserts that exact handle remains owned through failed-close and zero-IO warm
retry, then checks cold admission. Corrected module:36 passed/21.88s/exit0,
log `C:/temp/entry-install-probe-close-corrected.log`; the separate opt-in
export test is unchanged and is repeated in the final combined gate. The
repository's known Windows Unicorn mem_map access-violation diagnostic is
printed while pytest completes.
Coverage includes actual private COM entry, exact GRJ equality and sole rename,
ten competing artifacts, missing/changed GBMO, same-length valid foreign P1,
changed whole live inputs/OWNER, malformed role/action/result/phase/generation,
partial GRT, representative open/read/short/seek/false-position/close/rename
faults, three warm-close quarantine controls, cold successful re-admission,
cuts immediately before/after rename and separate fresh recovery to the exact
phase0 owner. Recovery retires only the exact GBMO request and consumes the
installed GRJ; unrelated GRA is preserved.

The runtime pack includes genuine0, cold-repeat1, valid-foreign-party1,
missing-gbmo1 and separate-recovery0 fixtures, each with independent C/D trees.
Execute `C:\EBINST C:\BOOT.DSC`. The manifest records every input and complete
expected post-run file hashes; each case carries its matching diagnostic COM.
No retail tree is mounted. Luna's focusless GameLink v4 evidence is at
`C:/temp/GoldBox-task250-entry-install-luna-evidence-20261014/verification.json`;
the pinned manifest SHA256 is
`3114d936f65b3cdaf46edd2680e6bf7855a40181559fa941a08d59953f206390`.
All five cases matched DOS ERRORLEVEL (genuine0, cold-repeat1, valid foreign
P1 1, missing GBMO1, separate recovery0), and each DOSBox process exited0.
The genuine installer changed only GRT→GRJ: GRT disappeared and GRJ appeared
with the exact343736-byte oracle hash above; every other file stayed identical.
The separate recovery reached phase0 owner GSK SHA256
`24c70cfde1ab71fa94981fa634418738d5e6aa50e813c3de8827f07c5f98a4c8`,
preserved P1 and GRA, and consumed both the installed GRJ and exact
`COMBAT.OUT` request. The expected inventory omitted the unchanged EBINST.COM
entry even though RUNTIME specifies it as an input; Luna verified that its
input hash remained unchanged and found no other unexpected files. DOSBox logs
show only MOUNT.COM and the case diagnostic COM. GameLink's consumed-marker
timeout occurred at PAUSE after status capture; statuses, process exits, logs,
screenshots and file hashes are in the evidence bundle.

Fault coverage is representative, not every streamed chunk or close ordering.
The full repository corpus, commit and push remain coordinator responsibilities.
