# CoK Task 201: first combat archive data reads

Date: 2026-09-28. This bounded original-loader run continues after selector
`0x24` entry and captures actual DAX data-section reads from both combat
archives. It stops after the first data read from each; it does not claim full
archive consumption or a combat result.

## Run and provenance

`tools/probe_cok_task201_combat_archive_reads.py` began at packed `START.EXE`
entry. VROOMM loaded retail `GAME.OVR`; the tracer modeled DOS services and
memory. No overlay preload, stub patch, fake key, or seeded party was used.
Per-byte file-read logging was enabled only after `DUNGCOM.DAX` opened.

| Artifact | SHA-256 |
|---|---|
| Runner `tools/probe_cok_task201_combat_archive_reads.py` | `2711CBCCE408F5757450C16C2901F4EE771069216F861065ED5CC40AD7AE41CC` |
| Output `C:\temp\goldbox_task201_combat_archive_reads.txt` | `E9934ABF99A8E96C345622E4713192F0673A770351363AFE9CC817E8730AFDD0` |
| `START.EXE` | `E51D88ECEF07CFFE4A14036DE3DBDC6CE7E7FF0DB7482F3771D6F99EB7BBB956` |
| `GAME.OVR` | `C3F448C391EA860F97DEC99CE88B0B8B0A4A7E807CF3B1F5A8F1515E2A7A0529` |
| `ECL2.DAX` | `4F4BA999B0D46817091E82FE5CCF27CB6EEE95CD833389353D7285C2A8DCCBEA` |
| `DUNGCOM.DAX` | `827176E941F24176F1907BDE40A81928CB4C2DA66231CA6B07C72B0B03A0BF2A` |
| `RANDCOM.DAX` | `78E5DAAB63D6880E8093E4BD25B50768AAC81E7F004F783947F0205A0E69E925` |

The invocation executed 53,923,929 Unicorn instructions. It reached ECL2#57
`COMBAT` at index `0x8354`, entered selector-24 handler `3EE3:191C`, then
opened both DAX archives. The active script index was `0x8355` by the time the
second archive's data was read.

## First compressed-block bytes

Both archives are single-entry DAX containers with `toc_bytes=9`, so their
data section begins at file offset 11. The paired trace captured:

| Archive | DAX block | First data read | Runtime destination | Block sizes |
|---|---:|---|---|---|
| `DUNGCOM.DAX` | 1 | file position 11, length 1 | `2491:3965` | raw 7,217; compressed 5,531 |
| `RANDCOM.DAX` | 1 | file position 11, length 1 | `2491:3965` | raw 1,745; compressed 1,012 |

The immediate next `DUNGCOM.DAX` read was file position 12, length 3, into
`6917:0000`; the complete file-read sequence is retained in the output. The
probe stopped after the first data-section read from `RANDCOM.DAX`, before
claiming the complete compressed block had been read or decompressed. The
data-section start and block sizes were checked independently from the retail
DAX TOCs.

## Bounded result

Task 201 closes bounded at the first compressed-data byte from each combat
archive. It does not identify the fully decoded combat roster, prove a combat
turn or attack callback, or establish an effect-7 producer. The allocator is
still modeled. No DOSBox, GUI, or input injection was used.
