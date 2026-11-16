# DQK WHO form dispatcher: static follow-through from `1D42:00F8`

Date: 2026-07-29
Scope: retail RAM/code analysis only; no new DOSBox run
Source artifact: ignored `build/dqk-who-dispatch-r1-20260728/`

## Result

The verified post-INT16 stop is the generic key normalizer, not the ECL `WHO` handler. One BIOS
Down result (`AX=5000`) matches table entry 54, jumps to `1D42:021A`, and becomes internal code
`0104`. The WHO form callback records that code at `DS:A6B2`; the enclosing input wrapper reduces it
to byte `84` and sets `DS:C2F5=1`. The live WHO caller then follows the active party node's next far
pointer at `335E:3C3D`. In this capture the active node is `5794:033C` and its next node is
`5794:04DA`, exactly the pointer transition corresponding to the observed Danahir-to-Grunschka
highlight move.

The important confirmation correction is also now explicit. Standard BIOS Enter (`AX=1C0D`) is
absent from the 64-entry dispatcher table, so the fallback returns its low byte, internal code
`000D`. In the captured keyboard path this does **not** set `C2F5`; the current WHO caller therefore
skips its key switch at `335E:3BE9` and loops. The switch does contain a `000D -> 335E:3C36` commit
case, but it is behind the `C2F5 != 0` guard. Thus that branch means **flagged `0D`**, not ordinary
keyboard Enter. This explains the authentic observation that Enter leaves the selector open and
narrows the remaining problem to finding which form event produces flagged `0D`.

## Provenance and checkpoint timing

The two complete GameLink RAM images are each 655,360 bytes:

| checkpoint | SHA-256 |
| --- | --- |
| `who-before-down-checkpoint/full.bin` | `8576015ef2ac73f41508bbb1dd6e780cb4a53553e69e9812822fbfe9c0d99328` |
| `who-after-down-checkpoint/full.bin` | `a713e6a9d463d1874b803dc215fd73b926508fc26927b4c7237d60142d1524b2` |

Despite the filenames, the after image was taken at the input checkpoint before the debugger let
the Down result traverse the generic callback. Consequently both images still contain
`DS:A6B2=0108` (the prior Up code) and `DS:C2F5=0`. Those unchanged values are not evidence that
Down failed. The later debugger stop proves `AX=5000` at `1D42:00F8`; the code path below proves
where it will go. A future writer breakpoint is the correct way to capture the mutation itself.

The stopped registers in `who-dispatcher-stop.txt` are exact: `CS:IP=1D42:00F8`, `AX=5000`,
`DS=ES=SS=3A52`, `BP=FE64`, `SP=FE4C`. The return-stack words unwind through:

```text
08FB:006C  INT 16 helper
1D42:00F8  generic normalizer return point
2470:0059  wrapper thunk (return at 2470:005E)
22CA:170F  generic form key call (return at 22CA:1714)
13FF:1008  form wrapper
13FF:1206  key/result wrapper
13FF:1997  mode dispatcher
335E:3AE5  active WHO selector caller (return at 335E:3BD8)
```

## The complete 64-entry normalizer table

The routine at `1D42:00E7` calls the BIOS helper, then `00FB..010F` searches 64 words at
`1D42:0114`; the parallel word at `1D42:0194 + 2*index` is the near target. Misses jump to
`1D42:0298`, where `and ax,00ff` is the fallback. Grouped without omitting an entry, the table is:

```text
F300->023F  F400->0226
1000 1100 1200 1300 1400 1500 1600 1700 1800 1900 ->025C
1E00 1F00 2000 2100 2200 2300 2400 2500 2600 ->0270
2C00 2D00 2E00 2F00 3000 3100 3200 ->0284
3B00 3C00 3D00 3E00 3F00 4000 4100 4200 4300 4400 ->0249
4700 4737 475C ->022B
4800 4838 487E ->0214
4900 4939 ->0230
4B00 4B34 4B7C ->0220
4C35 ->023F
4D00 4D36 ->0226
4F00 4F31 ->0235
5000 5032 5060 ->021A
5100 5133 ->023A
5200 5230 ->0244
5300 532D 532E ->0257
```

For the two discriminating inputs:

| physical key result | table result | internal result |
| --- | --- | --- |
| Down, BIOS `5000` | index 54 -> `1D42:021A` | `AX=0104` |
| Enter, BIOS `1C0D` | no match -> `1D42:0298` | `AX=000D` |

The Enter row is conditional on the conventional BIOS INT 16 return `1C0D`; unlike Down, this
artifact does not contain a stopped Enter register snapshot. The dispatcher transformation itself
is exact.

## Form callback and selector state

The form table is selected by `DS:DAC0=3` and `DS:DAC7=3A52:DB68`; records are 0x20 bytes. Its
relevant exact fields are:

| object | primary callback | event-5 callback | flags byte at `+1C` |
| ---: | --- | --- | --- |
| 0 | `22CA:1183` | `13FF:064F` | `90` |
| 1 | `13FF:008E` | null | `B0` |
| 2 | `22CA:0F37` | `13FF:0B21` | `80` |

`22CA:1183` delegates event 5 to `13FF:064F`. That callback accepts the internal navigation-key
range and writes the normalized word to `DS:A6B2` at `13FF:06B8`. The generic form loop then sends
events `13`, `1`, `4(-1)`, and `1B` at `22CA:174D`, `1760`, `1773`, and `178A`; at `17A0` it tests
form flags bit `10`. Object 0 has that bit and returns index 0.

`13FF:1206` consumes `DS:A6B2`. For a word above `FF`, its path takes the low seven bits and adds
`80`, so `0104` becomes `84`; it also sets the byte at `DS:C2F5` for this extended result. `000D`
stays `0D` and does not take that setter.

The current caller's six-entry key switch at `335E:3C12/3C1E` is exact:

| result byte | target | meaning established by code |
| --- | --- | --- |
| `0D` | `335E:3C36` | set local result to zero, then commit; reachable only when flagged |
| `1B` | `335E:3C2A` | cancel branch |
| `84`, `85` | `335E:3C3D` | follow active node's next pointer; wrap to list head on null |
| `87`, `88` | `335E:3C60` | alternate list traversal/reset family |

The active selector pointer is stored through `13FF:02D1/02E1` in `DS:A7B5/A7B7`. The checkpoint
has `5794:033C`. The party head at `DS:C6E5/C6E7` is `5794:0000`, and exact next-pointer traversal
produces:

```text
5794:0000 -> 5794:019E -> 5794:033C -> 5794:04DA
          -> 5794:0678 -> 5794:0816 -> 5794:09B4 -> null
```

At `335E:3C3D`, Down dereferences the current node and therefore selects `5794:04DA`. At
`335E:3D00` the routine commits the selected pointer and calls `13FF:02D1`. A separate global
pointer at `DS:AD67/AD69` happens to equal `5794:033C` in this image, and another selector routine
at `2772:067C` moves it with the same `84` convention, but it is not on this stopped call stack.
Treat that routine as corroboration only, not as the writer for this WHO input.

## Fact versus inference

Facts above come directly from retail bytes, stopped registers, stack words, and complete RAM
values. The mapping from the two node pointers to the displayed names Danahir and Grunschka is a
cross-check against the authenticated before/after screen observation. The likely conclusion that
a mouse/form event is meant to manufacture flagged `0D` is an inference: the exact producing event
has not yet been captured, and the corrected SELECT clicks remain bounded negatives.

## Next discriminating breakpoints

On a fresh one-action handoff, arm these only while the debugger is halted:

1. `13FF:06B8` — proves the callback write to `DS:A6B2`; record AX/SI and the input family.
2. `13FF:140B` — distinguishes the extended-key path that sets `DS:C2F5`.
3. `335E:3BE9` — record AL plus `DS:C2F5` at the WHO caller's guard.
4. `335E:3C3D` and `335E:3D00` — prove Down's next-node selection and the committed pointer.
5. `335E:3C36` — the decisive confirmation breakpoint. A hit proves the input produced flagged
   `0D`; ordinary keyboard Enter should not hit it from the captured zero-marker state.
6. `13FF:02D1` — record the far-pointer argument when movement or confirmation commits.

The most economical next probe is one corrected SELECT action (or the smallest isolated mouse
event family) with breakpoints 3 and 5. If it reaches `3BE9` with `AL=0D, C2F5=1`, the confirmation
protocol is solved. If it never reaches that state, tracing object 2's `13FF:0B21` event callback is
the next lower boundary. Do not rerun digit guesses or use the ECL WHO overlay entry as a per-key
breakpoint.

## Reproducer

`tools/analyze_dqk_form_dispatcher.py` verifies the relocated dispatcher byte anchor, decodes all
64 code/target pairs, applies table and fallback normalization, reads the live form callbacks,
walks the party list, and prints JSON:

```powershell
python tools/analyze_dqk_form_dispatcher.py `
  build/dqk-who-dispatch-r1-20260728/who-after-down-checkpoint/full.bin
python -m unittest tools.test_analyze_dqk_form_dispatcher
```

The ignored retail checkpoint integration test skips cleanly on machines that do not have the
artifact.
