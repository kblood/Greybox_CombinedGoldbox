# Secret PRINT and full-narration contract

Task249 original proof is complete: 37 focused controls execute unchanged
original DOS PRINT/PRINTCLEAR, parser, packed decoder, Pascal string helpers,
renderer, wrap/clear/page routines, font fetch and CGA glyph blitter. Root's
independent run passed37/37. Native implementation and compiled controls are
present. Final integrated focus passes2074 controls in128.30s, exit0; the
post-run patch-context checks pass5/5. Root independently passes357 controls
in23.62s, exit0, and verifies all26 frozen binaries and retained floors.
Luna's ordinary V3 public run passes the full first155 as117+38, second119 as
117+2 and composed journal52, with correct captions/menus and real manual1
responses. Strict source/state checks bind returns393/490/517, seed1234 and
unchanged currentP1. Authored255/70, cold/repeat, old-authority compatibility
and four isolated native public rejection cases also pass. Implementation
and fresh release validation are complete. Clean44/46/full-boot/corpus/app/Rust
gates pass. Release3e1158cd is verified against local and SSH remote HEAD;
the clean release-tree receipt is `release-gates/release-head-verification.json`.

The oracle files are `tools/secret_print_oracle.py` and
`tools/test_secret_print.py`. The original boundaries are GAME.OVR166E..1709,
9073..91A8, A480..A625 and974C; resident renderer58B9..5B43, wrap57EC/5863,
clear600E, glyph55E7/CGA61E3..627F and page5E1D/7133/733F. The complete original
8X8D5.DAX member201 supplies declared source-backed font state; the oracle does
not claim execution of the whole font-loader route. Per-glyph source indices,
wrap-space omissions, source font bits, coordinates and all16 CGA writes are
attributed and checked. Script, font, code, six patterned actors, nonzero
comparison flags and four seeds remain immutable. Narrow and no-read-hook
executions agree; no renderer/helper is substituted.

Held area16 Amiga ECL.GLB instructions at10D,189 and1B39 decode/render155,119
and36 characters. Their selected bytes equal original DOS ECL1.DAX#16 at+2;
whole Amiga executable parity is outside the proof. The opening apostrophes
are literal source bytes. The journal's source sequence1EA/1B39/1FB composes
exactly `HE CONTINUES, AND YOU RECORD IT IN JOURNAL ENTRY 37.` on the continuing
original cursor. The original38x6 viewport fits the first155; a continued
bottom cursor separately exercises real paging and declared future BIOS keys.

The original decoder consumes the declared packed length, skips zero6-bit
symbols and clamps the Pascal result at255. Original rendering255 does not
return: byte source index5852 cycles254,255,0,1 while the bound remains255.
Wide unbroken words also attempt all indices but glyph55E7 clips positions
outside the viewport. Both material differences remain explicit original
negative controls. Greybox's finite word-index paging/full display fixes those
original renderer defects; only decoder/string/PC parity is claimed there.
No input bound, instruction budget or test assertion was reduced to hide them.

## Native protocol and compatibility

CCECL changes only Secret `is_gen2=2` PRINT11/PRINTCLEAR12. Zeros are skipped
before32; direct invocation retains at most32 decoded bytes. A CCFLOW GBLR child
emits the existing DREF only after33 nonzero characters. Non-PRINT operands,
all other profiles and direct-preview bounds retain their previous behavior.
The DREF retains area, source offset, packed length and full member extent.

Outer GBSL remains version2. GBPX extension1 retains exact legacy stop-zero,
up-to340 count and injected append separators, including old Secret streams.
Extension2 identifies original Secret skip-zero/clamp255 and exact source
append with no inserted separator. It governs every row from row0, including
short rows staged before a later DREF. An invocation latches its semantic class
at the first validated chunk; Secret16 cannot switch to/from legacy9/14/15.
Secret GBRS12/13 state-present transitions and legacy schema evolution remain
valid. Successive durable generations may change extension1 to2; a single
stream never mixes codecs. No-reference saturated GBSL1 keeps its frozen
separator policy; task249 does not introduce another marker or reinterpret it.

CCFLOW resolves method0/kind1/DATA GLIB by checked u32 file extent and seeks,
at most256 pointers includingEOF, an exact at-most512-byte ID table (127 rows),
unique keys, valid member indexes, monotonic bounded pointers and exact20..16000
selected member extent. All packed bytes remain verbatim in the extension.
Read length, successful seek result and close success precede publication.
Existing DAX buffers are reused across disjoint resolver lifetimes.

CCFP validates the complete extension/context before rendering row0, skips all
zeros, displays at most255 with a word cursor and applies PRINTCLEAR once per
event. Exact append covers both inline and long rows. Late page IO and checked
extension2 close failure precede answer creation or WHO edits. CCNEXT validates
closed extension versions/counts in their already checked Secret effect bank.
Python retains codec1 as its default and requires typed valid Secret16 for2.
CCEFX has an explicit diagnostic capability plus closed v16/GBRS/status checks;
the shared validator keeps CCHOST extension2 admission disabled. Narration
support grants no Secret DAMAGE/journal mutation authority.

The first public attempt with source80061 exposed two caller/presenter seams;
that obsolete26-tool freeze and the complete gate11 failure snapshot remain
external. GBBOOT had supplied bare `ECL.GLB` to strict read-only CCNEXT `/D`,
which requires a canonical drive path. The qualified captured packet admitted
without any format change. The caller now uses existing DOS TRUENAME in its
actual drive/CWD for each effect/roster/source argument, appends each canonical
result immediately and leaves raw source names/CWD unchanged. Carry, overlong
results and tail overflow reject before EXEC. No strict `/D` rule is relaxed.

The held horizontal menu2B was already supported by CCMENU, but the long-stream
CCFP presenter lacked that boundary. Its new branch requires full typed
Secret16/GBRS13/status2/GBSI/raw flags, flags1/reserved0 and positive bounded
count. Final event destination/count operands, identity, terminal stream row,
GBMT exact label count, extents within128 and zero suffix must agree. It renders
all numbered labels through the established legacy menu-label decoder. Manual
1..N becomes ordinary token0..N-1; automated choices remain zero-based and must
be below count. It emits ordinary18-byte GBMO2 and changes no WHO identity,
GBMS/GBSI or source effect. Zero-skip/clamp255 applies only to PRINT extension2,
not menu labels. Numeric0F, party22, WHO39, other profiles and mutation scope are
unchanged. Compiled exact-public and multioption tests preserve the two REDs,
manual/auto bounds, all stream codecs, typed malformed cases, late page/close
failures and true INITIAL publication/reopen. The complete ordinary public
narration and menu progression now pass with no repeated Invalid choice.

The second public attempt displayed the complete155-character operand as117
and38 characters, but exposed a distinct last-page caption copy bug. Graphics
rendering returns with ES=A000; `save_pending_prompt` had copied its DS buffer
into video memory. A compiled poisoned-caption/VGA control reproduced this
failure. The four-byte repair saves ES, selects DS for the copy and restores
ES; caption length, terminator and existing register contract remain intact.

The repeated empty menu input after final Enter was separately traced to the
installed DOSBox-X GameLink implementation. The actual guest retained CON
stdin, while its BIOS keyboard ring kept receiving Enter with the shared key
bitmap released and ready0. Tracking reinitialization at mode13-to3 cleared
`input_prev` without releasing the guest key. The isolated exact-tag candidate
removes only that reset. Paired ordinary-input probes reproduce repeated Enter
with the pristine executable and one Enter with the candidate, stable released
BIOS state, one subsequent distinct key, fresh-process zero state and correct
mouse release across the mode switch. No native console/parser change or extra
keyboard edge workaround is used. Luna's full public application retry passes;
the two obsolete native freezes and failed screenshots remain retained.

The pinned, isolated build recipe is
[`tools/build_dosbox_gamelink.py`](../../../tools/build_dosbox_gamelink.py), with
the minimal patch and instructions in
[`tools/dosbox-gamelink-build.md`](../../../tools/dosbox-gamelink-build.md).
Use its manifest `candidateExe` explicitly with public `-DosBoxPath` or the
hidden smoke helper's `-Dosbox`; it does not overwrite or become an implicitly
selected installed/default emulator. Clean-source patch application and exact
patched SHA are retained in the external patch-check evidence.

The V3 native manifest binds raw source SHA256
`8ee8652e83b34cb51dcafba8324877dbfd27e976c17618c3bad5c88fccdc3ab9`.
All26 build successfully with PowerShell7, exit0. Only CCFP adds4 bytes relative
to the obsolete V2 freeze; compared with released248, seven tools change and
19 are byte-identical. The measured current changed tools are:

| Tool | Emitted bytes | Resident bytes | Free bytes |
| --- | ---: | ---: | ---: |
| CCECL | 24855 | 65216 | 64 |
| CCFLOW | 7644 | 58935 | 6345 |
| CCFP | 24840 | 61494 | 3786 |
| CCNEXT | 30907 | 31163 | 34117 |
| CCEFX | 6785 | 16739 | 48541 |
| CCHOST | 31645 | 52251 | 13029 |
| GBBOOT | 64575 | 64831 | 449 |

External `new-frozen-v3/manifest.json` records each complete binary SHA/delta;
`public-new-v3-metadata.json` and `new-v3-preflight-strict.json` bind a new
ordinary fresh session, all26 tools, all15 original source bytes/mtimes and
absent P1/GSK/OWNER before launch. The installed emulator remains unchanged;
the explicitly selected candidate executable is SHA256
`067bf5ba5ed67b9c75c432cdf170d12b5efd9fd4dd25889c13713549f39f8faa`.

GSK, GBRS, VM arithmetic and ownership formats remain unchanged. Old INITIAL,
ACTIVE, no-sidecar, GBSL1 and legitimate extension1 streams retain frozen bytes
and their codec on no-answer reopen. A new producer after a valid answer may
publish extension2. Current P1, source identity, receipts and legitimate GKB/GKT
recovery still bind every durable generation.

Packed255, raw16000/packed-source14500, script64, v2 record1213/file65535 and
native retained headroom floors64/128 remain unchanged. CCECL reclaims only the
second aliased seven-word clock clear and duplicate fx_geo reset; compiled
historical/current poison controls compare all registers/flags with identical
clock addresses and prove repeated reset equivalence. Historical production
COMs are rebuilt from commit4149067e and all its includes with captured SHA pins;
standing tests do not depend on prior-session temporary binaries.

## Completed hands-on implementation verification

The genuine public source sequence displays all155/119/52 composed characters,
including literal apostrophes and exact source-owned spaces. First-page changes
preserve58/58 files, second-page changes72/72 and journal page-to-menu72/72.
The full current P1 remains SHA256
`f29192496c42f4467f5d168523b82492601fb2cdee7f3cb9cebb1798065994f1`;
the full seed remains1234. A later source passage after the journal answer is
observed without claiming campaign completion.

Public cold `/5` and repeat use the exact genuine journal-menu PRE. No-answer
reopening preserves GSK/P1/stream/seed/owned inputs and redisplays the same52
characters. Same-live-PID POST versus cold and repeat POST compares72 files,
69 exact: only the returned config's clone paths, `/E` versus `/5` batch bytes
and the16-byte `_GBRES.DOP` occurrence record differ. In that named record,
only its u64 at offset8 advances3 to4. Cold versus repeat is71/72 exact, with
only config clone paths differing. No other authority/counter is excluded.

Genuine released248 INITIAL and ACTIVE no-answer `/5` reopening retains its
old inline32 output and complete frozen GSK/currentP1. The named DOP generations
advance INITIAL `_GBECL`1 to2 and ACTIVE `_GBRES`3 to4. A real old INITIAL menu
answer then creates an ACTIVE codec2 successor with full119, return490,
seed1234 and unchanged P1; reopening that successor preserves all semantic
artifacts, with only `_GBRES.DOP` generation2 to3. These actual old-session
controls remain distinct from the separately authored extension1 compiled
transition and its explicitly declared parent settlement.

The authored255 and early-zero70 cases each create their own party through
CCPARTY and their own output through CCFLOW/CCECL. Actual pages, numeric0 response
and native pending/terminal sentinels pass. Terminal flags12/status0, seed1234
and MEM4C00=0/MEM4C01=90 are exact. These are declared diagnostics, not additional
held-game source or original raster parity claims.

Four isolated public Resume negatives run after actual public PrepareOnly on
genuine INITIAL clones: future GBPX codec3, truncated v2 packed stream, a private
valid-container source-byte change and a valid immutable-name current-P1 change.
The stream cases retain correct outer GSK3 framing; INITIAL has no receipt or
general CRC whose mismatch could mask codec/extent admission. Each actual guest
returns LAUNCH.BAD=NATIVE_FAILURE with no success marker or answer. Luna and
root independently verify all67 whole-session files, including43 runtime files,
byte-identical to the declared mutated PRE. Only LAUNCH.BAD is added; there are
no counter, authority, producer or READY exclusions. Original checkpoints,
all15 retail source hash/mtimes and26 frozen binaries remain exact.

Evidence includes `luna-task249-v3-hands-on-evidence.md`,
`root-v3-live-cold-repeat-audit.json`,
`luna-task249-public-negative-v3-r2-results.md` and the four independent root
negative POST reports under the external task249 directory.

## Verified release3e1158cd

Unchanged implementation `c1d6a7f984b229b248e27f2ae68c2a16bccbe1d9` passes clean
44/44 flows and46/46 scripts, bound to canonical native SHA256
`f44eb44e35c0fca81627099da600958a157d06b657f0ec8659e33087addf5b62`
and raw8ee source above. Both audits report zero retail file writes. Flow touches
only the DQK DOSBOX directory timestamp; scripts touch DQK and DoK DOSBOX
directory timestamps. Full boot has248 passing markers,0 failures and exit0.
Corpus passes11,711 /1 skip /84 warnings in738.51s, exit0, with11,712 collected.

App validation passes engine3061 /3 skips, typecheck plus web/author/Electron
builds, and actual web189/intros10/author8/Electron9, all exit0. No website source
change or deployment is part of this native/tool/documentation/C-Rust task.

Fresh merged Rust/C passes96 executed units and14 verification commands:
8851 legacy positives/31 negatives, all49, old main and new71-checkpoint fresh
default/chunk7/budget comparisons, EGA539 and standalone OPL60. The fresh CLI is
SHA256 `394bf4d13986ce8c1584452e57b25ef2962ffac28d10eca1b3f95faf281248a7`;
source/retail/generated/executable/DLL inputs remain pinned and unchanged.
This is bounded original-machine/device evidence; physical IRQ timing, PCM
audio and completed game campaigns remain outside the demonstrated scope.

Exact evidence is in `release-gates/root-flow-audit.json`,
`root-scripts-audit.json`, `root-boot-audit.json`, `corpus.log`/XML,
`web-apps` logs and `rust/build-c1d6-2382a3583eef44d5809882a1f04a1513/verification`
under `C:/temp/GoldBox-task249-20261012`. Root independently accepts these audits.
The subsequent remote integration contains documentation only; native source
and code are unchanged. Final all26 restoration/freshness checks pass. Release
`3e1158cdf3bfee73e3bcd925322d7f10874a6d66` is verified against local and SSH remote
HEAD with a clean release tree, recorded in
`release-gates/release-head-verification.json`. The continuous goal stays active;
Astra is planning task250, which is not yet selected.

Evidence is external under `C:/temp/GoldBox-task249-20261012`, including actual
released248 public32-character RED, original proof, all failed harness/positive
assumptions, original255 loop witness and compiled frozen-byte OLD RED. Those
failures are preserved. Native implementation/runtime and release validation
pass and release3e1158cd is verified.
