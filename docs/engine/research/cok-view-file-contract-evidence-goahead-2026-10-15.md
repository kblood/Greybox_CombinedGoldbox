# View file contracts: actual ABI evidence and implementation go-ahead

2026-10-15. Supplements plan20c1eeba. Astra read existing source/evidence and
computed raw hashes only; no candidate import, decoder, tests or app executed.

## Evidence accepted for this source decision

Luna's classification PID3868 and ABI PID55136 are reported by Root as actual
exit0 with drained streams. The stored ABI controls report PASS, two identical
acquisitions,16 discriminating mutants and retained low-local pending work.
Astra independently hashed both ABI acquisitions to
`4fd814ae6c0ba466e5a34a5c46b3a7051f2d77a62f02d5ce8b3e44c082c80db0`;
ABI controls:
`9c56e7a343f1b64e19a0c3e0caa437007a0fd5a3051eacc44a2cc93f103d2717`.
Classification SHA:
`3f8fb9ca7a1d9d97340bca46d33d8a7987eb056a59e84db204f4d15e6e0b1b2a`;
classification controls:
`f567c3d3efaf40f510bad31ac634e65acfe3eaae28321c3f0498265b418cf79b`.
All are under `build/rea/rea-view-host-guard-v3-luna-20261015-a`.

The six roots are exactly A46:13C9,14B4,144A,146F,01DF,1675.
146F is locally complete with no calls/gaps and AX/BL preservation true.
Its four instructions compare ES:[DI+2] withD7B3, conditionally write0067 to
DS:43AC, then nearRET147D; only flags/SP are written as registers.
The other helpers retain their actual unresolved INT21 edges; treating them
as locally incomplete is correct even though their complete source rows are
available. Source accounting is10,047 total (9,944 inherited +103 context)
under shared32,768/local16,384. Default pending work is empty, but85 unknown
intervening call/interrupt boundaries and54 reaching-definition boundaries
remain: this is not a global caller proof.

## Approved Sol source increment

Implement a fresh isolated file-contract consumer/emission candidate and
authored native original-wrapper controls. Approval is for source authoring
only; Astra reviews its freeze before Luna executes anything. Keep production
and the audit integration candidate separate. No AH06/AH30 implementation.

**First complete conditional contract: public read14B4 -> INT14E2.**

- 14B4 `b33f` sets BL3F;14B6 sets CX0064;14B9 enters14C0.14C6 calls146F,
  whose proved BL preservation applies across its actual near return.
- 14D4 performs original unsigned multiplication of requested record count
  atSS:[BP+0A] by ES:[DI+4];14D8 copies lowAX toCX.14DA loads the original
  buffer DS:DX fromSS:[BP+0C].14DD `8ae3` sets AH fromBL before14DF loadsBX
  fromES:[DI]. Consequently this public-entry path requests AH3F, including
  the original multiplication/truncation semantics; do not infer AL=0.
- The success/error/zero-count paths remain original: CF branches at14E6,
  division at14EA, optional result far pointer atBP+6, short-result/error
  propagation toDS:43AC, and RETF000E at1519. Never replace these with a
  host-side record loop, divide-by-zero workaround or count clamp.

**Second contract: public open13C9 -> INT140F, with close145F dependency.**

- 13C9 reads AL fromDS:43B2;13CC sets AH3D,13CE clearsDX.13D8 establishesBP
  and obtains the record pointer fromSS:[BP+8]. MagicD7B0 goes to1400;
  magicD7B3 goes through the actual close helper; other magic sets0066.
- 13F6/13F7 saveAX/DX;13F8/13F9 passES/DI;13FA PUSH CS plus13FB nearCALL144A
  creates the original far-return frame.144A reads SS:[SP+4], calls146F,
  and on the valid-record/handle>4 branch sets AH3E at145D for INT145F.
  RETF0004 at146C removes exactly the four parameter bytes;13FE/13FF restore
  DX/AX. This proves AH3D at140F only while the original saved words/return
  frame are intact; helper144A itself does not preserveAX.
- 1408 chooses record+30 as pathname,140B/140C setsDS=ES and140D clearsCX.
 140F therefore uses existing open with the actual mode byte; no arbitrary
  mode assumption.1411 restoresDS; original CF error path, empty-name1419
  XCHG, record writes and RETF0006 at142B remain unchanged.
- 145F's service is existing AH3E close. Preserve its error/CF behavior and
  the original subsequent record-magic update; do not invent close success.

The consumer must bind the complete pinned source/edge/helper evidence and
produce these conditional domains rather than globally changing
`known_request` for a site. The recovered incoming witnesses include
61:07FD->13C9,61:0826->14B4 and61:0830->144A, plus9E/69C callers. They are
real witnesses, not an exhaustive roster. Private joins13D8/14C0 and any
write/create entry do not inherit public-entry provenance. Do not acquire
more rows merely to prove an arbitrary global caller list for this increment.

## Runtime enforcement and integration shape

Use existing bounded `Extended::dos` open/read/close services. The consumer
adds source/ABI proof and scoped enforcement, not duplicate storage code.
Authenticate exact owner/base/source bytes, actual public entry/control path,
helper return frames and current request shape for any newly supported View
contract. Shadow entry/return evidence must arise from executing originals,
be per-machine, and invalidate on mismatched return, reset or failure.
Prefilled registers or jumping into140F/14E2 cannot manufacture provenance.

Bind or conservatively reject physical aliasing among saved AX/DX/CS/IP/BP,
callee parameter/return words, mutable record fields, DS:43AC and service
buffers/pathname. Segment inequality is insufficient. A narrow documented
nonalias subset is acceptable; never claim a static arbitrary-memory proof.
Retain ordinary original mutation/return behavior on supported paths. Before
calling the service, reject violated contract state without host file/cursor
side effects. Do not overwrite guest state to repair it.

Keep existing accepted baseline paths/services unchanged; scope new checks to
the proposed View admission mechanism. Original service bounds, namespace,
handle ownership and memory guards remain authoritative. Publish which SCC
obligations these **three** conditional service sites discharge, and the
remaining blocker for each priority fixed-role/root closure. Do not set every
slot supported; do not retain a generic file-contract blocker where this
exact guarded domain is now implemented.

Suggested owned source: a small `view_file_contracts.py` consumer plus its
classifier/emitter hook and focused controls; a small runtime witness/guard
helper only where needed; original-wrapper native tests using existing machine
and DOS-service code. Freeze the exact file delta, inputs and generated
contract report before review. No broad register-analysis framework or service
policy rewrite is part of this task.

## Required authored controls, then later Luna gates

Pure controls must reject altered source/opcodes/relocations, omitted helper
return/gap/write evidence, AX/BL false summary, public/private-entry confusion,
forged producer/frame and source-union changes. The consumer must use the
actual predicates tested by the mutants.

Native controls execute original13C9/14B4/144A/146F instructions and actual
Rust services at the declared application base1000. A base0 control is a
separately declared synthetic fixture, not application support. Use synthetic
record/stack/asset inputs transparently; retain original guest code bytes.

- Read full/short/EOF, zero count, original multiplication low-word behavior,
  valid and invalid magic, live/stale/invalid handle, buffer wrap/protection,
  optional result pointer, short-result0064 and DOS error propagation.
- Open valid/not-found/mode failure, empty pathname, D7B0 direct path and
  D7B3 close-then-open path; close handles<=4 and>4 with success/error.
- Actual saved AX/DX and CS/IP/RETF cleanup, DS restoration, service CF/AX and
  untouched registers/memory/tail. Inject physical stack/record/error-word/
  buffer aliases and modified return words; require the declared guard rejection.
- Wrong owner/source/public-entry witness or AH/BL producer must reject before
  new service side effects. Preserve fault/evidence-stop precedence and all
  existing baseline tests. No write/create success claim follows from read/open.

Guest admission stays35,740/91,590; this task adds zero guest bytes and preserves
the proposed30,900/32,768 union with1,868 headroom. The103 analysis bytes are
not automatically admitted. Two fresh source generations, focused original
wrapper tests, inherited full native suite and binary/provenance binding are
later gates after source review, serialized behind audit integration. Neither
current pure PASS nor this source go-ahead authorizes View or native app work.
