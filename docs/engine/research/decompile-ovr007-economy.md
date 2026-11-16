# Decompile — ovr007 / ovr020 / ovr022: shop economy, item value & money (Krynn)

> Loop iteration 7 of `decompile-worklist.md`. Cluster: **the money economy** — shop
> buy/sell pricing, identify cost, gem/jewelry appraisal, coin denominations, and item
> generation. Primary source: COAB `coab_extracted/engine/ovr007.cs` (`shop_buy` = `sub_2F474`,
> `ItemsValue`, `CityShop` = `sub_2F6E7`), `ovr020.cs` (`ShopSellItem`, `IdentifyItem`),
> `ovr022.cs` (`GetMoneyIndexFromString` = `sub_59BAB`, `appraiseGemsJewels`, `randomBonus`
> = `sub_59FCF`, `create_item` = `sub_5A007`, `share_pooled`). Cross-checked against
> `packages/engine/src/town/shop.ts` + `services.ts`.

> **Currency note:** Krynn (Dragonlance) uses **steel pieces** as the base coin, confirmed in
> the binary — the gem-value string at CoK GAME.OVR 0x2d1cc reads `"The Gem is Valued at … "`
> immediately followed by `" steel…"`. The engine already prices in steel.

## Buy price — `ItemsValue` (ovr007) — VERIFIED

Buy price is **not** a fixed list price. It is the item's stored intrinsic value `item._value`
**bit-shifted by the area's shop price-tier** `area2_ptr.field_6DA` (a 1-hot mask):

| `field_6DA` | price | | `field_6DA` | price |
| --- | --- | --- | --- | --- |
| 0x01 | `_value >> 4` (1/16) | | 0x20 | `_value << 1` (×2) |
| 0x02 | `_value >> 3` (1/8) | | 0x40 | `_value << 2` (×4) |
| 0x04 | `_value >> 2` (1/4) | | 0x80 | `_value << 3` (×8) |
| 0x08 | `_value >> 1` (1/2) | | default | `_value` (×1) |

So each shop has a tier (cheap dungeon vendor → expensive city) and prices every item by
scaling its own value. `shop_buy` then pays from the buyer's gold, falling back to the
**pooled money** if the individual can't cover it, else "Not enough Money."

## Sell price + coin payout — `ShopSellItem` (ovr020) — VERIFIED

- Base offer = `item._value / 2` (the Gold-Box half-list convention — the engine has this).
- **Stacked items:** for a stack (`count > 1`) that is **not** arrows/quarrels, the offer is
  `(count * (value/2)) / 20` — a steep bulk penalty (you can't dump 20 potions for full
  half-price each). Arrows/quarrels instead pay `(value/2) * count` (full per-unit).
- **Payout in coins:** `plat = offer / 5; gold = offer % 5` — i.e. **1 platinum = 5 steel(gold)**.
  If carrying it would overload, the excess platinum spills to the pooled money.

## Identify — `IdentifyItem` (ovr020) — VERIFIED

Flat **200 steel** (gold or pooled), clears the item's `hidden_names_flag` to reveal its real
name ("It looks like some sort of …"); if nothing was hidden, "I can't tell anything new."

## Coin denominations — `GetMoneyIndexFromString` (ovr022) — VERIFIED

Seven money slots, indexed `0..6`: **0 Copper, 1 Silver, 2 Electrum, 3 Gold(steel), 4 Platinum,
5 Gems, 6 Jewelry** (index 7 = none). `GetGoldWorth` collapses coins to a steel-equivalent with
**platinum = 5×** (per the sell payout). Pool/Share/Take operate per-slot.

## Gem & jewelry appraisal — `appraiseGemsJewels` (ovr022) — VERIFIED tables

**Gem** (one `d100` per gem):

| roll | value (gp) | | roll | value (gp) |
| --- | --- | --- | --- | --- |
| 01–25 | 10 | | 71–90 | 500 |
| 26–50 | 50 | | 91–99 | 1000 |
| 51–70 | 100 | | 100 | 5000 |

**Jewelry** (one `d100`, then a random within a band):

| roll | value (gp) |
| --- | --- |
| 01–10 | `rand(900)+100` |
| 11–20 | `rand(1000)+200` |
| 21–40 | `rand(1500)+300` |
| 41–50 | `rand(2500)+500` |
| 51–70 | `rand(5000)+1000` |
| 71–90 | `rand(6000)+2000` |
| 91–100 | `rand(10000)+2000` |

On **Sell**, the appraised value is paid as `value/5` platinum (= full value in steel). On
**Keep**, jewelry becomes a `Necklace` item carrying that value (gems can't be kept once rolled).

## Item generation — `randomBonus` + `create_item` (ovr022) — VERIFIED

`randomBonus` (`d20`): **1–14 → +1, 15–20 → +2** — the magic-plus roll used when generating a
random magic item. `create_item` seeds a blank `Item` of the requested `ItemType`, then for
weapons/ammo applies dice/plus/value from the item-data table (and the `preconfiguredItems`
table `seg600:082E` for the seven scripted treasure items).

## Krynn-binary anchors (CoK GAME.OVR)

| Routine | Anchor string | file offset |
| --- | --- | --- |
| `shop_buy` | `"Not enough Money."` | **0x83d5** |
| `ShopSellItem` | `"Is It a Deal? "` / `"Sold!"` | **0x29551** |
| `IdentifyItem` | `"… I'll identify your "` | **0x2974f** |
| `appraiseGemsJewels` | `"The Gem is Valued at "` (`… steel`) | **0x2d1cc** |

(`tools/disasm_cok.py strings`.) `"Not enough Money."` is preceded by its length byte and
followed by `0x55 0x89 0xe5 0x81 0xec` (`push bp;mov bp,sp;sub sp,…`) — the prologue of
`shop_buy`. Byte-level confirmation of the `field_6DA` shift table and appraisal ranges is
pending the overlay DGROUP base (methodology §3.2); the algorithm above is COAB-authoritative.

## Engine cross-check — reviewed 2026-10-11

`packages/engine/src/town/pricing.ts` implements `buyPriceFromValue`, `sellOffer`,
`coinPayout`, `appraiseGem`, `appraiseJewelry`, `randomMagicBonus` and the 200-steel identify
constant; coverage is in `packages/engine/test/pricing.test.ts`. These formulas are no longer
missing helpers.

### JavaScript tier-scaling correction — reviewed 2026-10-16

The original economy expresses tier scaling with integer shifts. Do not implement those as
JavaScript bitwise operators: they coerce the input to signed 32-bit, corrupting both discounts
and markups for large values. `buyPriceFromValue` now uses floored division for the four cheap
tiers and multiplication for the three expensive tiers; par and unknown masks retain ×1 behavior.
Scaled tiers also preserve the helper's prior non-finite results (NaN/+Infinity → 0), while
par/unknown still propagate NaN/+Infinity. Integer exactness is guaranteed only while the input
and result remain safe integers; no BigInt or clamping contract is implied.

Regression evidence: `packages/engine/test/pricing.test.ts` checks all eight tiers at
2,400,000,000 and the largest safe input whose octuple result remains safe. The focused pricing
test passes 17/17 and engine typecheck passes. The full engine test run does **not** pass on this
checkout: 2,300 passed, 725 skipped, 7 failed, plus one failed suite. The failures are in
`glibPaletteFallback.test.ts` (missing external Gateway TLB), `dokOverlandPictureSites.test.ts`
(source-text assertion), `dqkSave.test.ts` (four save-roster/count assertions), and `hlib.test.ts`
(two local-corpus assertions). They are outside the pricing files; baseline status is not
independently established, so retain them as outstanding failures rather than treating them as
passes or quarantining them. The corpus command is separately blocked because pytest is not
installed. The helper currently has no product consumer; `shop.ts` still uses candidate item
prices, so this correction does not establish purchase integration or a deployable behavior
change. Re-run the outstanding engine/corpus gates when their data/runtime prerequisites are
available.

**Subsequent validation clarification (Luna-reported):** The pricing-run counts above remain a
historical snapshot. Luna subsequently reports a full engine Vitest run against HEAD `1165dd66`
plus uncommitted serializer hardening/test changes, not the committed tree alone: 2,327 passed,
725 skipped, six failed, plus one failed suite. The suite failure is a missing external Gateway
`Always.tlb`; the six test failures are four DQK save-roster/count assertions and two HLIB
local-corpus assertions. Baseline status remains unestablished. The formerly failing
`dokOverlandPictureSites` CRLF assertion passes in the reported focused run (6/6). These results
do not establish full-suite clearance or clean-commit validation of the pricing correction.
`pnpm test:corpus` remains blocked by missing pytest.

**Latest validation — 2026-10-18:** `pnpm --filter @goldbox/engine test` ran at HEAD
`bbe81478` with uncommitted serializer hardening and GEO integer-dimension changes: 2,321 passed,
758 skipped, 0 failed (202 files passed, 59 skipped). The focused HLIB/DQK/GLIB and GEO-encoder
tests and engine typecheck also pass. The committed corpus gates preserve all thresholds and byte
assertions while explicitly skipping when required roots are absent. This is not complete corpus
validation: FRUA and DQK GOG roots and required Gateway WHDLoad files are absent locally, so their
evidence checks are skipped; the aggregate skip count also includes other unavailable game data.
The corpus command remains blocked by missing pytest. This dirty-worktree run is not clean-commit
or release clearance for the pricing correction or serializer change.

Product adoption remains partial. `packages/engine/src/town/shop.ts` now calls `sellOffer`
from `sellStack`, accepting a real stored item value when supplied and applying the ammunition
exception. Its buy path still calls `itemPrice` with the candidate per-item/kind table;
it does not consume the area's tier through `buyPriceFromValue`. The party economy uses a
scalar steel pool, so helper support for seven denominations and appraisal is not proof of
a complete denomination/appraisal UI or original overload-to-pool handling.

Remaining work: feed title-local intrinsic values and shop-tier fields into purchases,
and establish the money/appraisal callers per product route.

## Gen1 ↔ Gen2

The reference formulas are from CoAB; CoK's steel currency has a title-local string anchor.
CoK/DoK/DQK item values, tier fields and money callers require title-local verification.
The old blanket claim that every economy formula was proven identical across the trilogy
exceeded the evidence in this note.
