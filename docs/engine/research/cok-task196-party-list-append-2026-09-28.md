# CoK Task 196: second source-backed party-list member

Date: 2026-09-28. This bounded run continues the original no-input
START/VROOMM route through the first append after Task 195's source-backed
head insertion. It does not claim held-save continuity or retail allocator
ownership.

## Run and provenance

`tools/probe_cok_task196_next_party_member.py` started at the packed original
`START.EXE` entry. `CokMidiTracer` modeled DOS services; the game's loader
opened `GAME.OVR` and the retail data files. No overlay was preloaded, public
stub patched, key injected, or party seeded. The run stopped immediately
after the previous tail link equaled the next record pointer, before combat.

| Artifact | SHA-256 |
|---|---|
| Runner `tools/probe_cok_task196_next_party_member.py` | `8C9ECA999C8338F546463C63FDC69DD83393EE5B123B9E71FBCD44CFC1097EEC` |
| Output `C:\temp\goldbox_task196_next_party_member.txt` | `E7E7B952034C407D6BD6421266BB9A2267E2C6F987FF6FB9720593466FD6FDB9` |
| `Champions of Krynn/START.EXE` | `E51D88ECEF07CFFE4A14036DE3DBDC6CE7E7FF0DB7482F3771D6F99EB7BBB956` |
| `Champions of Krynn/GAME.OVR` | `C3F448C391EA860F97DEC99CE88B0B8B0A4A7E807CF3B1F5A8F1515E2A7A0529` |
| `Champions of Krynn/MON2CHA.DAX` | `B6034B1ACCAE8964D724C033F99A8B7C95C370A31C9F5AC7329E47604D5008DF` |
| `Champions of Krynn/ECL2.DAX` | `4F4BA999B0D46817091E82FE5CCF27CB6EEE95CD833389353D7285C2A8DCCBEA` |

The invocation executed 27,927,602 Unicorn instructions. It ran past Task
195's first insertion without fake keys and entered the same descriptor-17
list helper a second time with ECL2 block `0x39` active in `DS=1BC6`; the
interpreter index at that helper entry was `0x80A3`.

## Source record and tail-link update

At the second helper entry, the argument was `6298:0000`. Its captured first
400 bytes begin `08 56 41 52 49 41 4E 4E 41` (length-prefixed “VARIANNA”).
Retail `MON2CHA.DAX` block 62 decompresses to a 409-byte record with the same
prefix. Comparing the captured 400 bytes gives 396 equal byte positions;
differences are at `0x115` (`3E` runtime / `00` source), `0x143` (`00` / `0E`),
`0x145` (`48` / `52`), and `0x146` (`5B` / `33`). No mutation semantics are
inferred for those offsets.

Before the helper ran, the party chain was head `6109:0000`, with that node's
next link null. The helper wrote the new far pointer into the old tail's link
field at `+0x17F/+0x181`; the resulting link reads `6298:0000`, exactly the
passed node pointer. `DS:609A/609C` remained `6109:0000`. Thus the same
loader-backed invocation joins the second source record to the existing
party chain and preserves the original head.

## Bounded result

Task 196 closes bounded at the second source-backed list insertion. The
captured runtime records contain a small number of differences from their
retail `MON2CHA.DAX` source blocks; the raw offsets are recorded above, without
assigning cause. The run does not establish a held party, the next candidate
member, all demo setup, or retail DOS allocator ownership. No DOSBox, GUI, or
input injection was used. Task 197 follows the next candidate append at ECL2
block 57's `0x80A3` route position.
