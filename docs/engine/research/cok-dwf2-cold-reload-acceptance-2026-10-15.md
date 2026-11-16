# CoK DWF2: bounded headless cold reload acceptance

Date: 2026-10-15. Luna performed the fresh-process test under
[Astra's reload plan](cok-dwf2-cold-reload-plan-2026-10-15.md).
Root reviewed the original-resolution frames before each subsequent action and
reviewed the retained process, input, transfer and memory evidence. This accepts
one additional original character reload case; M1–M7 remain open.

## Actual route and process

Evidence root:
`build/cok-recomp/staging/dwf2-cold-add-luna-20261015-a`.
The accepted isolated audit-v3 executable has SHA256
`acb20d9b475b993e1a5d1fcefa5bf126442bca69a7b0f4519a3f89283cc01068`.
It used the existing WORLD C/manifest, budget60000000, chunk4096, unchanged
900-second wall limit and audit start-work16000000. No guest code was added.
The current production audit integration is a separate unfinished task.

The test cloned only the accepted DWF2.WHO409B and DWF2.SFX27B into its owned
save directory. The observed menu route selected Add, selected the only listed
character DWF2, observed Loading and the marked entry, then selected Exit.
Frame17 shows the singleton DWF2 party row, AC7/HP19. Its BMP SHA256 is
`1126b80803a9d89c7437391007170829889f8d716075a704990fcaef8f4512e4`.
Actual metadata records headless=true, window_created=false and no physical
input source. No View, Save Current Game or Begin action occurred.

Nine commands included bootstrap, five individual keys, two settles and close.
The seven observed BIOS words were7181,6480,20480,7181,7181,19712,7181;
all seven host enqueues match the seven successful AH00 callbacks in order.
Final work17750000, inputs7, fault0. These are observed results, not a reused
KRA image oracle.

Guest59176 ran19:07:12.180–19:13:42.872UTC,390.681s, exited0 with drained
streams and no forced termination. Supervisor67324 also exited0; its separate
finalization receipt records successful terminal copying and no cleanup failure.
The reviewed v2 supervisor/config supersede the retained unlaunched v1 package.
Canonical process-terminal.json was copied exactly to run/terminal.json with a
separate annotation. Original receipts retain session_accepted=false; acceptance
is this separate evidence decision, not a rewritten native status.

## Observed transfers and reconstructed state

The audit window contains1384 events/1694348 bytes; companion SHA256
`adbf063e6b96b4ef1c9947f6c896c0e4dac689a4c186f9badf42434abe66cefa`.
It preserves preexisting GAME.OVR handle provenance as unknown-open. Earlier
startup remains unobserved. Complete window publication and run_completed=false
at controlled close do not establish a campaign ending.

WHO reads include16 bytes at cursor0 and one byte at247 during listing, then
the full409-byte load at cursor0 (sequence21). Its service-owned buffer digest
equals the immutable WHO SHA256
`2db0a9658d32ad63af17fbdcde418d6ecd7e9b7e2918f89f48a5760ff374d4e1`.
SFX sequences30–33 each request9 bytes and actually return9,9,9,0 at cursors
0,9,18,27, all with carry clear. Independent source-slice hashes match each
transfer, including the empty EOF digest. The full source SFX SHA256 is
`0af2c5388cab0e03967604beef9d1e03298e4fbe1ee3968eb01ed59238a79ec0`.
The failed STF search is also retained: AH4E sequence24 returns AX18 with
carry set; it is not reported as a successful STF read.

Endpoint RAM SHA256 is
`7ea92f696b19de165ba972ba26bf5c3d5e5286e0b2aa7d1e83bbe8e350ebb0dd`.
DS=1BC6, distinct from SS=2491. Current-character DS:6096/6098 and party-head
DS:609A/609C both contain6109:0000. The character has Pascal name04-DWF2 and
null next words at017F/0181. Exhaustive comparison of all409 WHO bytes finds
exactly two differences:

| Character offset | Serialized | Live | Original-source explanation |
| --- | --- | --- | --- |
| 00E5 |51|4C|E3/E5 sidecar head rebuilt from5B51:0000 to5B4C:0000|
| 0137 |0A|00|First-free party slot assigned during insertion|

D6 remains02; no additional normalization was applied. The complete live
409-byte slice SHA256 is
`5f2514f31bcfbe9c16af1e52e4ce962bb48e2ed79a68f94c4c81915c12369da5`.
The assignment rules are grounded in
[original source reconstruction](cok-cold-add-source-reconstruction-2026-10-15.md).
The independent scalar count also equals1: original009E:1A9B loads the party
structure through DS:4B2C/4B2E (`c43e2c4b`), and1A9F increments its word067C
(`26ff857c06`). Reading that root from this endpoint yields5111:0000 and
count1 at5111:067C, within retained RAM. This address is derived from the
current root, rather than imposed from the earlier KRA allocation.

The three observed SFX nodes are:

| Far pointer | Raw nine bytes | Next |
| --- | --- | --- |
| 5B4C:0000 |5e0000ff0000004d5b|5B4D:0000|
| 5B4D:0000 |1a0000ff0000004e5b|5B4E:0000|
| 5B4E:0000 |2f0000ff0000000000|null|

Payload bytes0..4 match the three source records in order. Link words at+5/+7
are validated separately as original reconstruction writes, with no cycles or
truncated nodes. Full read-buffer hashes still bind all27 serialized bytes.
Source allocation requests are409 bytes for WHO and9 bytes per sidecar node;
the observed spans fit retained RAM and do not overlap. Allocator metadata
extents were not captured, so no broader heap-integrity claim follows.

## Independent validators and scope

BIOS publication validator29884 exited0, stdout10951B/stderr0. Trusted DOS
verifier34348 exited0, stdout168B/stderr0, PASS1384events with oracle_used=false.
Both streams drained. The DOS verifier checks integrity and continuity; the
independent file-slice and memory comparisons establish the additional local
semantics. Generic creation_acceptance=false is retained truthfully.

The source and writable save directories still contain exactly the two pinned
DWF2 files with unchanged bytes; all ten launch pins rehash without mismatch.
The actually launched Root-approved config is separately bound by SHA256
`38f0397d388fa294b4fd20a1b614a5f4bb9e342edfa4ed4f6ea6e00dda180885`;
the ten-entry prelaunch roster also retains the earlier candidate config.
Current START.EXE, GAME.OVR and KRYNN.CFG hashes match the independent trusted
source identities. There is no prelaunch retail mtime snapshot, so this report
does not establish unchanged mtimes or exclude identical-byte retail rewrites.
This case establishes a cold reload with a three-record sidecar, beyond the
earlier one-record KRA case. Full party management, View, world save/reload,
campaign gameplay and release packaging remain unfinished.

## Retained evidence identities

Paths below are relative to the evidence root above; earlier reports are
preserved rather than silently corrected.

| Artifact | SHA256 |
| --- | --- |
| acceptance-report-v2.json |81d25d75f5455013a2cd3189f207503a417ee3f7a9c0ae3be28984348c06715a|
| artifact-index-v2.json |bdce15d65d83d7b6ab41666752818b1639293dd92d37bd7173ffd179a60125f4|
| acceptance-completion-annotation.json |fb21f8f74172ad064562510a4e979a5d77c072644ddf680853e6df075846f1af|
| completion-annotation-index.json |3e2cd67b13ed1dc5833eeca09a16ebe9798b34dbbd87afe285937e72e12dbdb1|

The completion annotation supplies the actual scalar count omitted by the
earlier report field and corrects the retail/config identity bindings. Its
descriptor strings have a numeric-prefix typo: descriptor158 decimal is009E
hex, and descriptor97 decimal is0061 hex, not hex158/hex97. The module47/module53
bindings, source offsets, instructions and actual DS-relative reads are the
independently checked evidence used here.
