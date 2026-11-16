# CoK Task 197: third source-backed party-list member

Date: 2026-09-28. This bounded run follows Tasks 195 and 196 through the
third member setup on the original no-input START/VROOMM route. It stops after
the new node is linked and before combat; the DOS memory allocator remains
modeled by the Unicorn tracer.

## Run and provenance

`tools/probe_cok_task197_third_party_member.py` began at packed original
`START.EXE` entry. The game's loader opened `GAME.OVR` and retail data through
the tracer's DOS services. No overlay preload, stub patch, fake key, or party
seed was used.

| Artifact | SHA-256 |
|---|---|
| Runner `tools/probe_cok_task197_third_party_member.py` | `42DE634EA30E421359FA49652B4AB67FEFC3E0B185BF94ED871C9DB055658475` |
| Output `C:\temp\goldbox_task197_third_party_member.txt` | `BF67F0F86DCADCFAD84710F7638540916F7A363E9E128E58B4167E0AA43CFA62` |
| `Champions of Krynn/START.EXE` | `E51D88ECEF07CFFE4A14036DE3DBDC6CE7E7FF0DB7482F3771D6F99EB7BBB956` |
| `Champions of Krynn/GAME.OVR` | `C3F448C391EA860F97DEC99CE88B0B8B0A4A7E807CF3B1F5A8F1515E2A7A0529` |
| `Champions of Krynn/MON2CHA.DAX` | `B6034B1ACCAE8964D724C033F99A8B7C95C370A31C9F5AC7329E47604D5008DF` |
| `Champions of Krynn/ECL2.DAX` | `4F4BA999B0D46817091E82FE5CCF27CB6EEE95CD833389353D7285C2A8DCCBEA` |

The invocation executed 28,188,882 Unicorn instructions. At the third
descriptor-17 list-helper entry, ECL2 block `0x39` was active in `DS=1BC6` and
the interpreter index was `0x80A8`.

## Record identity and third append

The helper received pointer `62FD:0000`; the first 400 captured bytes begin
`0D 4C 59 4E 20 53 57 49 46 54 46 4F 4F 54` (length-prefixed “LYN SWIFTFOOT”).
Retail `MON2CHA.DAX` block 61 decompresses to 409 bytes with that same
prefix. There are seven differences in the first 400 bytes at offsets
`0xE3`, `0xE5`, `0xE6`, `0x115`, `0x143`, `0x145`, and `0x146`; the runtime
and source values are present in the paired output, and no mutation cause is
inferred here.

Before insertion, the chain was `6109:0000 -> 6298:0000 -> null`. The helper
wrote `62FD:0000` to the prior tail `6298:0000` at `+0x17F/+0x181`. The global
head remained `6109:0000`. This captures the third source-backed member and
its append to the same list in one original-loader invocation.

## Bounded result

Task 197 closes bounded at the third source-backed list append. It does not
prove held-save continuity, retail DOS allocator ownership, or the remaining
demo route to combat. No DOSBox, GUI, or input injection was used.
