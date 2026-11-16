# DoK combat initiative and turn order -- 2026-10-07

Verdict: **DERIVED and oracle-verified.** The retail DoK turn-order builder is located in
`Death Knights of Krynn/GAME.OVR`, and the rule below reproduces the unchanged original routines
bit for bit, including every RNG draw. This moves `disasm-combat-dok.md` §3.1 from UNLOCATED to
DERIVED (that file was deliberately not edited here; the owner of that ledger should cite this one).

Model: `tools/dok_initiative.py`. Tests (Unicorn oracle, nulls, mutation controls):
`tools/test_dok_initiative.py` -- **27 passed in ~17 s**. All offsets are `GAME.OVR` file offsets.

## The rule

Per combat round (the `while not end_combat` loop, `0x8C68`-`0x8D4E`), three steps in this order:

1. **Roll** -- `CalculateInitiative` (`0x1ED0F`; the only call site is `lcall 0x89:0x25` at `0x8C91`,
   inside a team-list walk). For each combatant:
   - not in combat (`player+0xC8 == 0`): `delay = 0`, **no RNG draw**;
   - otherwise `delay = max(1, d6 + DexReactionAdj(dex))` where `d6 = dice(1,6)` (`lcall 0xC5:4D`,
     pushed count=1 then sides=6, the `0x30EAC` loop, `Random(6)+1`);
   - then, if `(player+0xC9 + 1) & surprise_byte != 0`: `delay -= 6`;
   - then `if delay < 0 or delay > 20: delay = 0`.
   The result is stored in the combatant's action record (`[player+0xBD] + 3`), exactly one RNG step
   per in-combat combatant per round. It is **re-rolled every round**; nothing is stored between rounds.
2. **Surprise clears** -- `0x8CAB`-`0x8CB7`: the byte `area2[DS:0846] = area2+2CBh` is zeroed after
   the whole list has rolled. Surprise therefore only affects the first round (unless script sets it
   again). Team 0 is bit `1`, team 1 is bit `2`. With a `-6`, a surprised combatant ends at 0
   (does not act) unless `max(1, d6+dex) >= 7`, i.e. only d6=6 with dex adj >= +1 or a 5 with adj >= +2, etc.
3. **Sort** -- the order builder `0x910A` (near call `0x8CBE`, single call site). It walks the team
   list (head `DS:A2C6`, link `+0xB9`) in list order and insertion-sorts into the far-pointer array
   `DS:C4D5[]` (cap `0x48`; scan covers the first `0x40` slots), **highest delay first**:
   a newcomer scans from the front; it is inserted before the first entry whose delay it
   *beats* (signed byte compare); on an **equal delay it flips a coin**, `dice(1,2) == 1`
   inserts before that entry, anything else moves on to the next entry (so a tie group costs one RNG
   draw per tie met, and combatants with delay 0 tie with each other and draw too). An empty slot reads
   as -1 and always loses.

Acting (`0x9275`, called per array entry at `0x8CE8`) skips combatants with `delay <= 0`, and rewrites a
delay of 20 to 19.

`DexReactionAdj` (`0x3363A`, `lcall 0xCF:61`, byte at `player+0x17`): DEX 0-2 -> -4, 3-5 -> DEX-6,
6-15 -> 0, 16-18 -> DEX-15, 19-20 -> +3, 21-23 -> +4, 24-25 -> +5, 26+ -> 0. All 256 DEX bytes
match the original.

## Evidence

Oracle: `tools/dok_rng_oracle.Machine` (Unicorn, unmodified START.EXE resident + GAME.OVR overlays);
for `CalculateInitiative` every callee except the dice routine, `DexReactionAdj` and the resident
Random/FillChar is stubbed to `xor ax,ax; retf n` (only the loaded copy; nothing on disk is touched).

| Check | Result |
|---|---|
| `DexReactionAdj`, DEX 0..255 | 256/256 equal |
| Initial delay: 6 seeds x 24 DEX values x in-combat{0,1} x team{0,1} x surprise mask{0..3} | 2304/2304 equal in delay **and** final RNG state |
| One RNG step in combat, none out of combat | verified (6 seeds) |
| Order builder: 300 random team lists (1-9 combatants, tie-heavy pools) | 300/300 equal in order **and** final RNG state |
| Strictly increasing list, no ties | no RNG draw; reversed order |

## Nulls: other rules predict differently on the same inputs

Mismatches against the original (not against the model):

| Alternative | Mismatches |
|---|---|
| d10 instead of d6 (Journals' "10 segments") | 1012 / 2304 |
| d4 | 600 / 2304 |
| no DEX modifier | 560 / 2304 |
| no surprise penalty | 576 / 2304 |
| surprise penalty 3 | 384 / 2304 |
| floor 0 instead of 1 | 48 / 2304 |
| ascending turn order | 241 / 300 |
| stable ties, no coin flip | 230 / 300 |
| "stored value, never re-rolled" | the original's delay takes >= 4 distinct values over 199 seeds |

## Mutation controls (patched loaded copy of the original, each seen RED against the model)

die bound 6->8 at `0x1EDC9`: 808 mismatches; surprise `sub ...,6` imm -> 0 at `0x1EE18`: 576; floor
`cmp delay,1` -> 0 at `0x1EDE3`: 20; DEX table `sub ax,6` -> 7 at `0x33669`: exactly DEX 3,4,5;
sort `jg`->`jl` at `0x9198`: 300/300; tie coin `cmp al,1`->2 at `0x91AE`: 230. The unpatched original
agrees again afterwards (fresh machine per test).

## Differences from the COAB model (`ovr009.FindNextCombatant`, `ovr014.CalculateInitiative`)

Roll step is the same shape (`1d6 + DexReactionAdj`, floor 1, team-surprise `-6`, clamp to 0, range 0..20).
DoK **does not** pick the next actor by rolling a d100 per candidate each pick: it builds the whole
sorted order once per round and ties are one coin flip each. Native engines modelling the COAB
`FindNextCombatant` would consume the RNG differently.

## Not verified / limits

- `+0xC8 = in combat` and `+0xC9 = combat team` are read from the instruction semantics and COAB's
  field names; the oracle writes those bytes itself, so it proves the arithmetic, not who sets them.
- Who sets the surprise byte (ECL / encounter setup) and its encoding beyond the bit test is not
  traced; `DS:0846` holds `02CBh` in the unpacked START.EXE image (area2 offset), the oracle uses that.
- `reclac_attacks` (`0x1FA78`), `0x1FB95` and `0xCF:106` run before/after the delay roll inside
  `CalculateInitiative` and write other action fields (attacks left, half moves, `+6`); they were
  stubbed and are not part of this rule. The `AffectHaste` handler at `0x1D826` (x2 on `[BE6C]`) acts on
  half-moves, not on delay.
- The `0x910A` order is verified for lists up to 9; the 0x48 cap and the 0x40-slot scan limit follow
  from the code but were not exercised.
- The sorted array is acted from by `0x9275` as the round proceeds, but I did not trace mid-round
  changes (a combatant's delay changing after the sort, e.g. delay-reducing actions); only the
  round-start build is established. Whether CoK (a different build) is identical is not tested here.
- Noise: `pytest` prints a `Windows fatal exception: access violation` traceback from Unicorn
  `mem_map` (one 1 MB machine per test); exit status and counts are the signal, as with `test_dok_rng.py`.
- Scratch note: the disassembly helper `tools/disasm_dok.py` resolves paths relative to the repo root
  and its `overlays` / selector `resolve` heuristics mislabelled `0xC5:4D`; use
  `tools/borland_overlay.read_descriptor(...).resolve(off)` (stub index = `(off-32)/5`) instead.
