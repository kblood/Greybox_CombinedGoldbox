# Private ENTRY caller overlay

The validated path lifetime overlay is now enabled in normal public CCNEXT;
ENTRY framing/provider/comparison remain private. There is no new ENTRY command
or installer, record version, stack size, or builder limit. The actual production
coordinator retains its original 1120-byte allocation for standalone callers and
explicit `CCNEXT_NO_PATH_OVERLAY` public builds. Normal public composition
defines `KN_PATH_OVERLAY`, aliasing only that allocation to `rw_paths[0:1120]`.
Preparation and reward/RZ framing own that storage at different times. The
11th ITEM path, RW header/context, and coordinator header/context remain separate.

## Measured images

`python tools/native-probes/entry_overlay_capacity.py <unused-temp-directory>`
reproduces four profiles and NASM listings. Each has exactly one final 512-byte
stack. The opt-out must match the frozen old public hash, while the overlay with
default writer must match `native/build/ccnext.com` byte-for-byte. The redundant
private coordinator copy was removed; both branches now exercise production code.

| Image | Resident | Builder headroom | SHA-256 |
| --- | ---: | ---: | --- |
| Production coordinator, default writer, explicit opt-out | 65163 | 117 | `1cf5774e62c571939f93fec4f9e46fccb8bd93ee2732d1cfbe5f6903fe9c51ca` |
| Overlay on, default writer | 64043 | 1237 | `73c77198988215c00c99f625f1cfb9a492d892208c446282519a52db6dee2c14` |
| Overlay on, one probe writer, ENTRY provider/comparator | 65033 | 247 | `925dea6362250ab43b0f76552cc5396871a5a84e3de82fbcb6b5d0c8cebd7262` |

The opt-out ENTRY composition remains diagnostic-only at 66153 resident bytes;
it exceeds the builder by 873 and was never executed. Listing assertions verify
the active alias, the un-emitted inactive allocation, nonoverlapping header/context
ranges, and the ITEM suffix. No 4 KiB standalone scratch buffer is appended.

## Compiled controls

```text
python -m pytest tools/test_secret_reward_prepare_overlay.py -q --tb=short
python -m pytest tools/test_secret_reward_entry_full_overlay.py tools/test_secret_reward_entry_source.py tools/test_secret_reward_entry_serializer.py tools/test_secret_reward_entry_serializer_faults.py -q --tb=short
```

The final runs passed 9 and 118 tests, respectively. The latter is 59 full-caller
controls plus 59 original standalone controls (the original 54 were strengthened
with member and all preimage-side corruption cases). Full provider tests reuse
two existing dead RT arrays, both physically below the provider. Physical
below/above-provider placement remains covered separately by the standalone
controls. Full framing uses RV member, RT state/items/ledger, and RL request
storage with explicit nonoverlap bounds. Startup path buffers are dead during
the private framing call; only their disposable input data is initialized.

Preparation comparisons use real program/PSP entry and compare status, whole
files, children, and defined DOS arguments/results rather than relocated pointers.
They include INITIAL/retry/successor and descriptor/path/context/read/close
refusals. Public `/R` witnesses actual `rl_derive` and `rz_recalc` and exits 2
with exact final files and no native handles. A separate private stress carries
prepared resident storage through poison, real replay/recalculation, ordinary
serialization, and ENTRY framing without reloading code or setting grants.

## Disposable runtime export

Set `SECRET_ENTRY_OVERLAY_RUNTIME_OUT` to an unused private directory, then run:

```text
python -m pytest tools/test_secret_reward_overlay_runtime_pack.py -q --tb=short
```

The exporter passed 1 test. It emits per-file length/hash/provenance manifests,
26 current public programs selected from `build.ps1` (replacing only CCNEXT with
the private image), and these cases:

- `fresh-initial`: exact first native INITIAL checkpoint from the genuine owned
  fixture, its standard descriptor and source/party/effect/seed/stream inputs.
  Run `CCNEXT /P C:\DESC.BIN` twice, expecting exit 0 and exact expected INITIAL
  authority. Cold reopen with `CCNEXT /R C:\PARTY.GBP D:\ECL.GLB C:\NEXT.BIN`,
  expecting exit 2 and unchanged authority.
- `retained-final-journal`: the existing same-state `final_capture`/`retained_post`
  builder plus its successor descriptor. Run `CCNEXT /P C:\NEW.DSC`, expecting
  exit 1 with every input preserved.

Mount each case's C and D directories separately. Luna owns runtime: use the
pinned DOSBox-X mode-change candidate, hidden SDL dummy and focusless GameLink;
capture ERRORLEVEL and file hashes, and terminate the owned process for cold
reopen. No DOSBox is launched by these tests. Provider/comparator corruption,
I/O faults, and poison are Unicorn-only controls. Luna's serialized runtime pass
verified prepare/retry exit0, cold resume exit2, and retained-journal refusal
exit1; all 37 retained inputs remained unchanged. Only path-level file-open/close
evidence was recorded; no numeric handle assertion is made. This remains a
private overlay experiment, not public ENTRY installation or Task250 release.

Runtime manifest:
`C:/temp/GoldBox-task250-entry-runtime/luna-v2-fresh-run/artifacts/runtime-evidence-manifest.json`,
SHA-256 `ea34a822adb68a55ad9da8b2a9d25f7848dfb255503ecd19db695d5e2df1030a`.
It records screenshots, RAM, status files and DOSBox path-level logs for all four
cases. PARTY.GSK matches the 150974-byte INITIAL reference, SHA-256
`15552a569103f9849cdf90fb02bc669fa9e831be0f24821902348c5097b707d6`;
NEXT.BIN is 392 bytes, SHA-256
`1c1445bb00c418f8188ade3df5375daf3cf1338c0fc612659f33b21bdc3d7f96`.
The pinned DOSBox-X executable is
`{repo-root}/build/tools/dosbox-x-2026.07.02/bin/x64/Release SDL2/dosbox-x.exe`,
SHA-256 `cd76d7cd07c3b699be0d3ce05c436471f5fca371aa5f6e9e1a5225101d29d7f8`.
Hidden SDL dummy video/audio, GameLink output/version4, 720x400 frames and
serialized sessions were used.

Frozen local evidence: `C:/temp/GoldBox-task250-entry-overlay-capacity/`.
Curated runtime pack: `C:/temp/GoldBox-task250-entry-overlay-runtime-pack-v2/`.

Production integration checkpoint: all 26 targets build at native source SHA-256
`2e6bd736efec6823e3a6dc51fe39ab539a8efa26babe855d028408774db1f22d`.
The real public binary exactly matches the previously validated 64043-byte
default-writer overlay. Production-backed private controls plus actual public
process tests pass 138 tests. Explicit runtime export profile `production` stages
that public binary without private ENTRY helpers; the default export still stages
the private ENTRY probe. Luna's production GameLink fresh/retry/cold/refusal pass
is complete. Native44 passes44/44, native46 passes46/46, and EngineSmoke reports
248 PASS/exit0. Corpus remains nongreen at13728 passed/7 skipped/84 warnings and
3 failures: flow/scripts freshness guards await a post-commit fresh sweep, and
original selected-field oracle `[31765-2]` needs its targeted retest. The native
passes do not permanently resolve the freshness failures. Electron E2E passed9/9
with exit0; final provenance/review remains pending. Evidence:
`C:/temp/GoldBox-task250-production-path-overlay-*`.
