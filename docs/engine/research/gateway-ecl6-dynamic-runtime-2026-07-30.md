# Gateway ECL6#21 native dynamic-wilderness runtime trace (2026-07-30)

## Result

Gateway's retail DOS executable was cold-loaded from an authentic campaign save into ECL6#21,
member 24 at `(8,2)` facing west. Ten legal wilderness steps reached `(0,4,W)`. One further
forward attempt displayed `ENTER SUNDABAR? YES NO`; selecting `YES` loaded ECL5/GEO5 and arrived
inside Sundabar at `(15,2,W)`. The run used an isolated retail stage and focusless GameLink input
only.

This closes the native-runtime portion of the ECL6 dynamic-wilderness and Sundabar-gate contract.
It does **not** directly observe the earlier ECL2#1 `NEWECL 21` hop: the earliest retained ECL6 save
already begins at `(8,2,W)`.

## Provenance and isolation

- Stage: `build/runtime-gateway-ecl6-dynamic-20260730`
- Stage manifest: `build/gateway-ecl6-dynamic-stage-20260730.json`
- Main trace: `build/gateway-ecl6-dynamic-runtime-20260730-r1`
- Cold-load control: `build/gateway-ecl6-dynamic-runtime-20260730-r2-coldload-g`
- Main owned DOSBox-X PID: `54848`; cold-load-control PID: `63328`
- Both processes were stopped explicitly. A final DOSBox-family process check was empty.
- `GAME.EXE`: `0222834b801d9bae16b50ede0b1e738be5aa4803440980915081a1e5cfca5c00`
- `GAME.OVR`: `c2e64df225bf80026d4bc16d865804dd9e51b1296e6496fa46bba3c2e704f5cd`
- `ECL6.DAX`: `858d1add57dd1165a1b11d0160b7d6bf4c1f867aa35a7e13d719698173dfa8d6`
- `GEO6.DAX`: `e85fc2e7c0416ef4fbc4bb5f7e961d43d86805cbcd3d2cff8c8bf0f373e5c44d`
- `ECL5.DAX`: `47a30b5717427718d7ffa01d42a4c3c079c648077458e3c71c46821dc96f87cd`
- `GEO5.DAX`: `2f1aca22db947b51a0238fd8a8ecf0075ac97da72351cf1e2352131feade04e9`
- Input slot B `SAVGAMB.DAT`: `7dd96735ed11ff34d12e71f33450df1ac49981984b43942d01a3511dea74343c`

`tools/analyze_gateway_ecl6_runtime_trace.py` independently validates the retained same-process
RAM dumps, screenshot hashes, and archive-open log. Its output is
`build/gateway-ecl6-dynamic-runtime-20260730-r1/trace-report.json`.

## Native route and dynamic clock

After selecting `MOVE`, the route was:

```text
(8,2,W) --F--> (7,2,W) --F--> (6,2,W) --F--> (5,2,W) --F--> (4,2,W)
          turn south --F--> (4,3,S) --turn west-->
(3,3,W) --F--> (2,3,W) --F--> (1,3,W) --turn south-->
(1,4,S) --turn west--> (0,4,W) --F--> ENTER SUNDABAR?
```

The ten successful steps advanced the displayed time exactly as follows:

```text
08:38 -> 20:39 -> 08:40 -> 20:41 -> 08:42 ->
20:43 -> 08:44 -> 20:45 -> 08:46 -> 20:47 -> 08:48
```

Thus each successful ECL6 movement search advanced the native clock by 12 hours and one minute,
visually corroborating the byte-decoded `ECL_CLOCK #12,#3` at ECL6#21 `0x82DB`. No random
encounter interrupted this particular RNG run.

Key frames:

- `08-begin-b.png`: initial native wilderness `(8,2,W) 08:38`
- `13-forward-7-2.png`: first legal forward step `(7,2,W) 20:39`
- `26-forward-0-4-w.png`: pre-gate `(0,4,W) 08:48`
- `27-sundabar-prompt.png`: native `ENTER SUNDABAR? YES NO`
- `28-sundabar-yes.png`: ECL5/GEO5 arrival `(15,2,W) 08:48`

The first two arrow inputs issued before selecting `MOVE` changed neither pose nor clock. They were
normal command-menu navigation, not terrain-collision observations. The actual movement trace
begins only after frame `12-move-mode.png`.

## Same-process RAM evidence

Three bounded 1 MiB GameLink RAM captures were retained. Their SHA-256 hashes are:

| State | File | SHA-256 |
| --- | --- | --- |
| `(8,2,W)` before movement | `ram-00-pre-move.bin` | `30da31c6f6654bdc6ac2d417a791da0d5d33ce9f817e9c21b0b0f6b95cdf0d14` |
| `(7,2,W)` after one step | `ram-01-at-7-2.bin` | `5b9a9170640549a8327aea748788d8fe9d659c337d245e7b26e49226cb4b0cb5` |
| `(0,4,W)` pre-gate | `ram-02-at-0-4-w.bin` | `8d79c616f1e09db2054e71100e1161aa9582fe9e7f4630e7373a4343ffa6e632` |

The five-byte initial pose record `08 02 06 00 09` occurs exactly once in the pre-move dump, at
physical `0x153B0`. At that same address the next capture is `07 02 06 00 09`, and the gate capture
is `00 04 06 00 09`. This validates the process-local interpretation as
`x,y,raw-direction,wall-type,descriptor`; raw direction `6` is west.

A unique exact 32-byte slice from slot B's saved Area1 record locates the resident Area1 at physical
`0x4DA90` in this same process. Across all 0x800 bytes it differs from the save at only Area1
`+0x1E0` (`09 -> 08`). Using the established Gen1 Area1 word mapping, the captured values are:

| State | `[0x4C00]` encounter counter | `[0x4C24]` current submap |
| --- | ---: | ---: |
| Before movement | 3 | 24 |
| At `(0,4,W)` | 3 | 24 |

The live descriptor `9` at `(8,2)` independently identifies GEO6 member 24: retail members 21..26
have descriptors `[4,10,8,9,2,3]` at that coordinate, so only member 24 matches. The runtime Area1
value then corroborates the byte-level GEO discriminator. Descriptor 9's byte-derived encounter
threshold is 6 over the native `0..100` roll domain. The counter remaining 3 is consistent with
eligible failed rolls retaining the saturated cooldown; this run does not claim a runtime-observed
encounter or a recovered live address for ECL scratch words `0x7F79/0x7F7C/0x7F80`.

## Native archive transition

The main DOS file log is
`build/gateway-ecl6-dynamic-runtime-20260730-r1/dos-files.log`, SHA-256
`b7124935def977337245b696c589497f14fe3ee9ee84976c5a9981af5a1f2b0b`. It records native opens
in this order:

1. `ECL6.DAX` and `GEO6.DAX` while the wilderness is active.
2. `ECL5.DAX` and `GEO5.DAX` immediately after choosing `YES` at Sundabar.

The validator counts two opens each for ECL6, ECL5, and GEO5, and four for GEO6. This is a
file-I/O-layer confirmation of the visible chain from ECL6#21 to ECL5#19.

## Cold-load control

The isolated stage already contained authentic slot G from the prior original-DOS canonical
campaign capture. A separate process cold-loaded that unchanged slot and began adventuring at
`(15,2,W) 08:48`, matching the immediate post-YES arrival exactly:

- `SAVGAMG.DAT`: `ce1b0e4c12706d29f5ce2c7becf8cf674aef76ba2178572b3bca910dc9453518`
- frame `build/gateway-ecl6-dynamic-runtime-20260730-r2-coldload-g/09-coldloaded-g-arrival.png`:
  `3d79e302ab5f78a3098b7c2329cdab12190ceb00da9579fb0bd5106883e7bbcb`
- cold-load log: `0b1e36d196b49eab388745fe271a54fc37de4ef1d59a8a1217f599f47b24a5eb`

This is a cold-load control of an existing authentic post-crossing save, not a claim that the main
PID 54848 created slot G anew.

## Claim boundary

The trace proves native ECL6/GEO6 member-24 movement, its per-step clock effect, live cooldown and
submap values, the exact Sundabar pose/prompt, the YES branch's ECL5/GEO5 load, and a matching
original-DOS cold reload. It does not directly observe ECL2#1 entering ECL6#21, does not generalize
physical RAM addresses beyond PID 54848, and does not claim a runtime random encounter from this
RNG sample.
