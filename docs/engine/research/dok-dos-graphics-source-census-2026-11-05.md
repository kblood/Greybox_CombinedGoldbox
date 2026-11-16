# Death Knights of Krynn DOS graphics source census

The source inventory and ID coverage view at `?graphics=1&sourceCoverage=1&sourceGame=dok`
records the 37 graphics and structural DAX occurrences listed in the DoK section of the
[DOS inventory](../../dos-inventory.md). Its pins identify the local installed DOS/GOG copy;
they do not independently authenticate a retail edition. DoK Amiga, C64 and the remaining titles
are outside this scan.

| Scope | Archive occurrences | TOC entries | Exact source IDs |
| --- | ---: | ---: | ---: |
| `PIC1`–`PIC7` | 7 | 43 | 94 |
| `SPRIT1`–`SPRIT4` | 4 | 16 | 46 |
| Standard frames: `BACK1`–`BACK5`, `BIGPIC1`–`BIGPIC3`, `CBODY`, `CHEAD`, `COMSPR`, `CPIC1`, `SKYGRND`, `TITLE` | 14 | 351 | 351 |
| Tile arrays: `8X8D1`–`8X8D5`, `DUNGCOM`, `WILDCOM` | 7 | 12 | 1,946 |
| Raw font: `8X8D1` block 201 | Included above | 1 | 177 |
| Drawable subtotal | 32 | 423 | 2,614 |
| `WALLDEF1`–`WALLDEF5` (structural) | 5 | 7 | 0 |
| Inventory total | 37 | 430 | 2,614 |

Every inventory entry has a known drawable count. Standard frames consume exactly the 17-byte
header and their packed pixels. Tile arrays also use a 17-byte header: the count byte must match
the framing, with `0xFF` admitting exactly 256 tiles in each of the seven large banks.
`8X8D1.DAX` block 204 is a tile array with just tile 0. Its block 201 is exactly 177 glyphs
of eight row bytes, rendered with the most significant bit on the left. The DoK glyph bytes
match CoK's, and their IDs remain separate source occurrences.

The [roster](dok-graphics-source-roster-v1.json) pins the relative archive path, byte length,
SHA-256 and ordered TOC block IDs. The [census and decode receipt](dok-graphics-source-census-v1.json)
retains every TOC ordinal, compressed and decompressed payload hash, and each admitted child's
dimensions, stored bytes hash (`indexSha256`) and row-major fixed EGA RGB hash. The stored bytes
are packed 4-bit pixels for frames and tiles and the eight original row bytes for a glyph. A read-only
reproduction must match all 37 pins before it accepts or writes any generated metadata:

```powershell
python tools/dok_graphics_source_census.py
```

The [source registry](dok-graphics-identity-registry-v1.json) uses locators such as
`dok/dos-ega/dos-install/pic2.dax/block/1/entry/0/frame/1`, with `/tile/<index>` and `/glyph/<index>`
suffixes for those profiles. TOC and child ordinals are zero-based.
The archive SHA-256 stays in the identity metadata. Equal pixels or repeated block IDs never
collapse distinct locators. The original 140 source identities and 30 stored-order groups are unchanged.
Tile and glyph arrays have no animation groups.

The [exact-pixel review transfer](dok-dos-exact-pixel-visual-descriptions-v1.json) adds visual
descriptions to 185 DoK source IDs across 162 appearances. It matches the census dimensions and
stored EGA RGB SHA-256 against the pinned
[CoK DOS block-201 glyph reviews](cok-dos-font-glyph-visual-descriptions-v1.json), retaining each
target's archive, locator and stored-content hash. The 177 glyphs match their CoK glyph bytes.
Eight other source IDs have the same 8×8 black appearance as reviewed glyphs and retain their
tile locators. The sidecar records every approved donor reference for each appearance and requires
agreement on the original wording. The registry identifies the wording as copied from previously
reviewed exact pixels. The sidecar's CoK registry input pin was refreshed after the four exact
curated face links were added; the 185 target rows, 162 appearance descriptions and donor evidence
are byte-identical. Its refreshed SHA-256 is
`a4198cd7f7c69b5a96dcf7dc69db24401efc96be9db16a09fedc14c0ab52fd77`.

The [registry pixel review extension](dok-dos-registry-pixel-visual-descriptions-v1.json) adds 506
DoK DOS IDs across 335 more appearances. It joins census width, height and stored RGB SHA-256 with
the CoK registry's decoded dimensions and RGB SHA-256. Of the 522 matching DoK IDs, 16 (one
appearance) already belong to the glyph review. The extension keeps all 1,215 matching CoK source
IDs and the same wording for each appearance. Each appearance has a DOS donor. The 168 Amiga
candidate ADF tile donors establish exact appearance only; retail Amiga provenance remains
unestablished. The pinned CoK registry links every donor to its full review evidence. The offline
verifier checks seven review datasets, 16 archive occurrences, and 339 distinct source PNGs by
file hash and exact native RGB. Historical source-preview paths containing `restyle` do not
establish Restyle lineage.

Together the two reviews describe 691 rows across 497 appearances, leaving 1,923 rows across
1,695 appearances without visual text. All DoK semantic descriptions remain empty and unknown;
character identity, subject, game use, playback meaning, cross-version identity and Restyle
lineage remain unestablished. No new DoK visual inspection was performed.

The census command above verifies both sidecars and the annotated registry, including the local
donor archives and review PNGs. Pass `--write` to reproduce the metadata from the reviewed
baseline. The roster and census stay byte-identical. The extension input pins were refreshed to
the current CoK registry and exact-pixel sidecar; its 335 appearances, wording and donor evidence
are unchanged. Its refreshed SHA-256 is
`c92c9273caa0b59df9dfe43e1ce71e555926c2fcdf7ebe0cd35c12d272ba1ea1`.

The graphics browser shows a DoK source preview only after verifying the selected local archive's
SHA-256, exact locator, stored child bytes and RGB hash. Preview uses the stored pixels without
applying gameplay transformations: the PIC2 delta differs from the gameplay XOR result, and
`TITLE.DAX` entry 3, block 4 uses stored RGB SHA-256
`ead77ce4f4a0f18ad02194febe698909bd4a5f9a831f9cad4ac1c0e21297ed4b`, distinct from the de-rolled view.
The production preview helper verified all 2,614 children from the pinned archives in Node, including
tile 255 in each large bank. No source images are bundled and gameplay decoding is unchanged.
Vite and browser acceptance remain held.

The roster is 11,888 bytes, the census is 1,762,541 bytes, and the annotated registry is 2,825,740
bytes. The original sidecar is 179,282 bytes. The extension adds a 346,217-byte sidecar and
249,694 registry bytes, below its 384 KiB and 256 KiB caps. Both slices add 854,700 bytes to the
unannotated metadata, below the 1 MiB growth cap. Total DoK metadata is 5,125,668 bytes, below 5 MiB.
