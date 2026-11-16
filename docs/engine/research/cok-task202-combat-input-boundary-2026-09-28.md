# CoK Task 202: original combat route input boundary

Date: 2026-09-28. This bounded no-key run continued the original START/VROOMM
route through the first combat archive reads and stopped at a 100-million
instruction cap. It did not reach a BIOS keyboard wait or a traced combat
action.

## Run and provenance

`tools/probe_cok_task202_combat_input_boundary.py` began at packed retail
`START.EXE`, with modeled DOS services and allocator. No overlay preload,
stub patch, seeded party, or fake key was used.

| Artifact | SHA-256 |
|---|---|
| Runner `tools/probe_cok_task202_combat_input_boundary.py` | `C28687C352E0D6E9480503E67196E0331E5A187C0FD88FB189435A025B42964A` |
| Output `C:\temp\goldbox_task202_combat_input_boundary.txt` | `1BB373D26C4ACF75B50A013B0FE9B0926FA25F0B9819FC6ECD10BDBFEEEF806B` |
| `START.EXE` | `E51D88ECEF07CFFE4A14036DE3DBDC6CE7E7FF0DB7482F3771D6F99EB7BBB956` |
| `GAME.OVR` | `C3F448C391EA860F97DEC99CE88B0B8B0A4A7E807CF3B1F5A8F1515E2A7A0529` |
| `ECL2.DAX` | `4F4BA999B0D46817091E82FE5CCF27CB6EEE95CD833389353D7285C2A8DCCBEA` |

## Bounded result

The runner observed ECL2#57's `COMBAT` command at interpreter index `0x8354`
and instruction 51,858,876. The selector-24 handler opened both `DUNGCOM.DAX`
and `RANDCOM.DAX`; Task 201's initial data reads were therefore followed by
continued retail overlay execution. No blocking INT 16h call was observed.

At instruction 77,588,222, the modeled INT 21h FindFirst service first saw
path bytes `43 3A 5C 76 FC FF 76 FA B0 00`: `C:\` followed by basename
`76 FC FF 76 FA B0`. The DOS logger uppercased that basename to `VÜŸVÚ°`
and reported zero matches. The output contains 5,094 FindFirst calls; 4,925
use that same malformed basename. Near the cap, execution repeatedly visited the
resident START helper cluster around complete image offset `0xAFC1` and
reached 100,000,000 instructions at `CS:IP=1A46:0B61`. The routine's role at
that address is unresolved; Task 193 separately places a bounded-copy helper
at `0xAF3E`. This identifies a bounded trace state only; it does not establish
whether the repeated search originates in the retail route, the modeled
DOS/allocator, or an earlier state mismatch.

The source of the first malformed search and the associated live buffer/stack
remain open for Task 203. This run establishes neither full combat-archive
decompression, an input boundary, a combat turn, nor an effect-7 producer.
No DOSBox, GUI, or input injection was used.
