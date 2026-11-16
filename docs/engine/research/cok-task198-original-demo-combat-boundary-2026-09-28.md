# CoK Task 198: original-loader demo route to COMBAT boundary

Date: 2026-09-28. This bounded run continues the original START/VROOMM
no-key demo route through its three party additions and scripted monster
loads, then stops before executing ECL2#57's `COMBAT` command.

## Run and provenance

`tools/probe_cok_task198_demo_to_combat.py` started from packed retail
`START.EXE`. The game's VROOMM loader read `GAME.OVR`; the tracer modeled DOS
services and recorded DAX file reads. No overlays were preloaded, stubs
patched, fake keys injected, or party seeded. The instruction ceiling was
60,000,000; the bounded stop occurred earlier, after 51,858,876 instructions.

| Artifact | SHA-256 |
|---|---|
| Runner `tools/probe_cok_task198_demo_to_combat.py` | `FCCC048EDBF33D11594E20E4BC0FB046745D93B10A1A981A1CC7FAA1CC45B602` |
| Output `C:\temp\goldbox_task198_demo_to_combat_60m.txt` | `CC4A305A4A7E92D7114089A108209BC48B510BAAF2587447CA61BF7BFD9D1C27` |
| `START.EXE` | `E51D88ECEF07CFFE4A14036DE3DBDC6CE7E7FF0DB7482F3771D6F99EB7BBB956` |
| `GAME.OVR` | `C3F448C391EA860F97DEC99CE88B0B8B0A4A7E807CF3B1F5A8F1515E2A7A0529` |
| `ECL2.DAX` | `4F4BA999B0D46817091E82FE5CCF27CB6EEE95CD833389353D7285C2A8DCCBEA` |
| `MON2CHA.DAX` | `B6034B1ACCAE8964D724C033F99A8B7C95C370A31C9F5AC7329E47604D5008DF` |
| `MON2SPC.DAX` | `2FE85111B833678AC8E94477B6AF5DEEF48E768BA0231E563DC6ED2559F5D358` |
| `MON2ITM.DAX` | `C95D2BEC68008B39733095C900F7ADD4F3964CDBED86FD3A95D24EA5FA4A566E` |
| `CPIC2.DAX` | `7925DA2DB12A4E42FFC2DF737FCE830FDDEDE11AE9D350E61A9A53F2950B94E4` |
| `HEAD2.DAX` | `9B26657869B3D033866DE66ACE9E8EBDE3DEDFCDAE5ED05FA00FC9D00BBEC27B` |
| `BODY2.DAX` | `7EDD8E0841581B1643828A21787594F6C96DDDC1718710DE9A8159575BEF467F` |
| `BIGPIC2.DAX` | `553DC458BE8209BEA0CA5F1DEA6406B5CD8A96750D3BADC05658F5A8EF241F0A` |
| `PIC2.DAX` | `B4C07F963EDCB88973BA7F3CAA80CBCAE4C88B3C71AA4C7AD3132CCBED1DBC51` |
| `SPRIT2.DAX` | `888A2786D382836E611E3CBCC17B9C33EEBDD2AF27085324BE9E12586846D77A` |

The same paired trace confirms the three source-backed party members from
Tasks 195–197. The ECL interpreter had ECL2 block `0x39` active in `DS=1BC6`;
its buffer cursor remained `0x8014`, while the live instruction index advanced
through the script and local subroutines. A first 40-million-instruction
attempt stopped during a `BIGPIC2.DAX` decode. The extended run continued to
the actual command boundary.

## Scripted monster loads and resource reads

The runtime reached these three ECL fetch indexes in order:

| ECL index | Retail ECL2#57 command | Nearby DOS file opens in the same callback interval |
|---|---|---|
| `0x833F` | `LOAD_MONSTER #10,#2,#10` | `MON2CHA.DAX`, `MON2SPC.DAX`, `MON2ITM.DAX`, `CPIC2.DAX` |
| `0x8346` | `LOAD_MONSTER #4,#4,#4` | `MON2CHA.DAX`, `MON2SPC.DAX`, `MON2ITM.DAX`, `CPIC2.DAX` |
| `0x834D` | `LOAD_MONSTER #31,#6,#31` | `MON2CHA.DAX`, `MON2SPC.DAX`, `MON2ITM.DAX`, `CPIC2.DAX` |

Earlier route rendering opened `HEAD2.DAX`, `BODY2.DAX`, `BIGPIC2.DAX`,
`PIC2.DAX`, and `SPRIT2.DAX`. These are observed DOS file opens/read destinations
in the modeled loader; this run does not independently decode every requested
archive block. The ECL command interpretation is also documented in
`research/cok-demo-entry-located.md`.

The next fetch reached interpreter index `0x8354`, the retail `COMBAT`
command. The code hook logged `TASK198_STOP_BEFORE_COMBAT` and stopped before
that command executed. No combat callback, turn input, or attack result is
claimed.

## Bounded result

Task 198 closes bounded at the original-loader ECL2#57 combat boundary. It
does not establish combat execution, held-save continuity, or retail DOS
allocator ownership. No DOSBox, GUI, or input injection was used. Task 199
continues from this source-backed command boundary and captures the first
combat callback or the first unsupported dependency/input.
