# Gen2 CKIT/DQK Combat Anchor Correlation

> Purpose: first clean-room decompile note built from the RTLink/Plus map. This correlates local
> DQK combat data anchors with local FRUA CKIT anchors without copying or relying on source.

## Inputs

- `The Dark Queen of Krynn/DQK.EXE`
- `C:/Program Files (x86)/GOG Galaxy/Games/Unlimited Adventures/CKIT.EXE`
- `build/rtlink-map-dqk-ckit.json`
- `docs/engine/research/rtlink-map-dqk-ckit.md`

## Structural Result

`tools/rtlink_map.py` recovers both RTLink/Plus descriptor tables:

| Binary | Descriptor table | Overlays | Relevant combat/data overlay |
| --- | ---: | ---: | --- |
| DQK | `0x0209af` | 13 | overlay `12`, file `0x062c30..0x06dc80` |
| CKIT | `0x01be85` | 28 | overlay `27`, file `0x084040..0x08f843` |

DQK overlay 12 uses the verified data/code start `0x063a20` from prior trace notes. CKIT overlay 27
has no normal `55 8b ec` prologue in the current scan; its start is still `reloc_count_approx` in the
RTLink map and must be confirmed before using code-relative offsets.

## Combat Anchor Table

| Anchor | DQK file offset | DQK overlay-relative | CKIT file offset(s) | CKIT overlay-relative |
| --- | ---: | ---: | --- | --- |
| `COMSPR` | `0x0674db`, `0x0697bb`, `0x06ace7` | ov12 `+0x48ab`, `+0x6b8b`, `+0x80b7` | `0x088939`, `0x08a9f9`, `0x08c179` | ov27 `+0x48f9`, `+0x69b9`, `+0x8139` |
| `DungCom1` | `0x0697c2` | ov12 `+0x6b92` | `0x08aa09`, `0x08de74`, `0x08df6e` | ov27 `+0x69c9`, `+0x9e34`, `+0x9f2e` |
| `WildCom1` | `0x0697cb` | ov12 `+0x6b9b` | `0x08aa00`, `0x08df77` | ov27 `+0x69c0`, `+0x9f37` |
| `A battle begins` | `0x0698f8` | ov12 `+0x6cc8` | `0x08c497` | ov27 `+0x8457` |
| `Aim: range =` | `0x0684af` | ov12 `+0x587f` | `0x08976d` | ov27 `+0x572d` |
| `Bandage` | `0x068afc` | ov12 `+0x5ecc` | `0x089db2` | ov27 `+0x5d72` |
| `Next Prev Manual Target Center Exit` | `0x068b22` | ov12 `+0x5ef2` | `0x089dd7` | ov27 `+0x5d97` |

## Interpretation

The closest bank-name cluster is:

- DQK: `COMSPR` at `0x0697bb`, `DungCom1` at `0x0697c2`, `WildCom1` at `0x0697cb`.
- CKIT: `WildCom1` at `0x08aa00`, `DungCom1` at `0x08aa09`, near `COMSPR` at `0x08a9f9`.

This supports the working hypothesis that CKIT overlay 27 carries the FRUA/Gen2 equivalent of DQK
overlay 12's combat UI and combat terrain-bank data cluster. It does not prove identical code paths or
table semantics; CKIT has extra `DungCom1` / `WildCom1` string copies that are likely editor/runtime
references and need xrefs before promotion.

## Verification Commands

```powershell
python tools\rtlink_map.py `
  "The Dark Queen of Krynn\DQK.EXE" `
  "C:\Program Files (x86)\GOG Galaxy\Games\Unlimited Adventures\CKIT.EXE" `
  --json build\rtlink-map-dqk-ckit.json `
  --markdown docs\engine\research\rtlink-map-dqk-ckit.md
```

The anchor offsets above were then produced by direct byte search and overlay-membership lookup from
`build/rtlink-map-dqk-ckit.json`.

## Next Work

- Confirm CKIT overlay 27's prefix/code-data split dynamically or through deeper RTLink fixup parsing.
- Xref CKIT's `0x08aa00..0x08aa09` `WildCom1`/`DungCom1` cluster and compare the loader call shape to
  DQK's `0x02cc1a` / `0x02cc33` branch.
- Search CKIT overlay 27 for a `BackGroundTiles`-shaped 4-byte terrain table and compare against
  DQK `0x069bb7`.
