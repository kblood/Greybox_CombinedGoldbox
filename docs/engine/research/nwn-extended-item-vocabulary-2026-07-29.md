# NWN extended item vocabulary — retail-byte recovery (2026-07-29)

## Verdict

The Neverwinter Nights DOS/AOL `MONITM.DAX` item-name vocabulary is **recovered for every code the
retail archive uses**, including the formerly unresolved codes `159`, `160`, `162`, `163`, `175`,
`216`, `222`, and `244`.

The verified table region is in `GAME.EXE`, begins at file offset `0x9B42` (`39746` decimal), and
contains 254 one-byte-addressable names. Code `0` is the empty/no-component sentinel; the recovered
names occupy codes `1..254`. The local retail evidence files are:

| File | Size | SHA-256 |
| --- | ---: | --- |
| `GAME.EXE` | 51,006 | `5d9338d529ae412018b0a74d8dcacdc2426bfd48e33b91d56c5018a5144c3033` |
| `MONITM.DAX` | 3,231 | `d49e64d4271bee3cde4b980e84ba85ea54aacf8769ddd49177bf9fd1d470dcdd` |

This closes the earlier `?159`-style research-probe output. It also corrects a broader issue: NWN's
low codes are title-specific too. For example, NWN code `47` is `Sling` (not the shared-table
`Mail`), and code `61` is `Arrow` (not `Elfin Chain`). The CoK/DoK-oriented 125-entry
`VOCAB.TXT` table must not be used for any NWN item name, not merely codes above 124.

## Executable record grammar

The table is located by this byte signature, unique in the examined executable:

```text
0A "Battle Axe" 0B 00 B2 00 0A 00 B0
08 "Hand Axe"  ...
```

The first byte is a Pascal-string length. There are two real record forms:

1. Normal tagged record: `[length][ASCII name][opaque 00 B2 00 opaque 00 B0]`.
2. Padded long-name record: a Pascal `string[20]`, `[length][ASCII name][zero padding to byte 20]`.

The second form explains the apparent “non-uniform stride” that blocked the 2026-07-22 pass. It is
not decoder drift or a variable weapon-stat structure requiring runtime execution. Walking each
record according to those two byte-grounded forms stays aligned from code 1 (`Battle Axe`) through
code 254 (`Cursed`). Examples that exercise the padded form include code 4 `Bec De Corbin`, code 38
`Two-Handed Sword`, code 148 `Thf Prickly Tools`, and code 235 `Secr Door & Trap Det`.

After code 254, Pascal strings such as `NeverWinter` and `Warehouse` no longer satisfy either
verified item-record grammar and appear to begin a separate place-name cluster. Because retail
`MONITM.DAX` never uses code 255, this pass stops at the last fully verified entry and assigns no
meaning to code 255 rather than guessing across that boundary.

## MONITM cross-check

Decoding all 38 `MONITM.DAX` blocks yields 117 carried-item records. Forty records use at least one
code at or above 125, and the exact extended-code census remains:

| Code | Recovered word |
| ---: | --- |
| 159 | `Drow` |
| 160 | `Wagon` |
| 162 | `+2` |
| 163 | `+3` |
| 175 | `Copper` |
| 216 | `Bone` |
| 222 | `AC 3` |
| 244 | `Diamond` |

The existing COAB name composition order (`namenum3`, then `namenum2`, then `namenum1`) produces
exact, mechanically plausible goldens from retail records:

| MONITM block/record | Raw codes | Decoded name |
| --- | --- | --- |
| `3/0` | `[0,47,159]` | `Drow Sling` |
| `3/1` | `[0,23,162]` | `+2 Mace` |
| `5/1` | `[0,222,79]` | `Bracers AC 3` |
| `43/1` | `[23,160,163]` | `+3 Wagon Mace` |
| `49/0` | `[0,244,216]` | `Bone Diamond` |

These contextual joins are the discriminating evidence that the stream position is the namenum:
the recovered words compose cleanly with the same records' base types, plus values, and monster
assignments, while the old shared-table lookup did not.

## Implementation and verification

- `packages/engine/src/loaders/nwnItemVocabulary.ts` adds a title-scoped, signature-located decoder.
  It requires the full 254-entry walk and fails closed for absent, truncated, or differently shaped
  bytes.
- `packages/engine/test/nwnItemVocabulary.test.ts` pins the record grammar, all eight extended
  mappings, the exact extended-code census, five composed-name goldens, and rejection of unrelated
  bytes.
- `packages/engine/test/nwnMonsterSideTables.manual.test.ts` now uses the recovered NWN vocabulary
  instead of its incorrect hard-coded CoK/DoK subset, eliminating both `?N` placeholders and wrong
  low-index words from that research output.

Verification run from the repository root:

```text
pnpm --filter @goldbox/engine exec vitest run \
  test/nwnItemVocabulary.test.ts test/nwnMonsterSideTables.manual.test.ts \
  test/nwn-dos-boot.test.ts
  -> 3 files passed, 15 tests passed

pnpm --filter @goldbox/engine exec tsc --noEmit
  -> exit 0
```

No DOSBox trace was needed; all claims come from static retail executable/archive bytes and the
existing DAX/63-byte item decoders.

## Claim limits

- Proven for the local 1994 DOS/AOL executable identified above. Signature location tolerates file
  relocation of an identical table, but other client revisions are not claimed without their bytes.
- This recovers display-name vocabulary only. It does not reinterpret NWN `MONSPC` affect ids,
  `ITEMS.1`, AOL server behavior, or save data.
- Current combat loot mechanics carry base type/count/value rather than display-name codes, so this
  is an engine data-decoder and research-output correction, not a new browser campaign feature. No
  app bundle or website deployment is required.
