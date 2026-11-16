# Secret ECL RANDOM source and native contract

Task247 executes the complete original DOS opcode08 handler and an
independent recurrence/range model. After that proof and Luna's seven actual
old-binary RED cases, the coordinator authorized the bounded native revision.
The separate
[state compatibility plan](secret-rng-state-compatibility-contract.md) records
the authority-reader contract for the implemented paired semantic revision.

## Complete original boundary

GAME.OVR dispatcher458B selects08's handler0DF7..0E54. The oracle enters0DF7
and requires its complete RETF with a balanced caller stack. It executes the
original parser9073, operand getter91AB, destination resolver9727, resident
Random at unpacked-imageD2AF, conversion wrappersD289/D28D and their internal
helpersD1C8/D207, then the original setter9F3A. Variable ranges additionally
execute original getterA0F1 and classifier9774. No lookup, RNG, conversion or
store helper is replaced.

Source hashes are pinned by the existing original loader:

- GAME.OVR SHA256 `d4f900391703bbfd5a4f66703871b64782dff2307224cd2560e40e1b60779c80`.
- START.EXE SHA256 `8b937984878ec72aa531335dd381a21bda67675408b5fd8e716a35ccd049999e`.
- Complete unpacked image SHA256 `4d903edc325ed652889e1159ddb45a967f435097a09f8beb85af8252d65556bd`.
- Held Amiga DISK2/ECL.GLB SHA256 `8c247ad1e1acceb02061197ea6745f5e090189a77dd8295f61b30ef90f390d12`.

Original resident Random atD2AF calls seed helperD2FE before testing the bound.
The seed helper reads and writes the two original words at DS:599C/599E.
The independent model is:

`next = (seed × 08088405h + 1) modulo 2^32`

`result = high16(next) modulo bound`, with result0 for bound0.

Resident bound0 still advances exactly once. The original ECL caller resolves
its first operand as a word, stores AL in a byte local, and increments that
byte unless it isFF. Thus its effective bound is `min((word & FFh) + 1, 255)`.
Its bound never equals0. Word0/256 give bound1; word1/257 give bound2; word255/
511/65535 give bound255. The latter does not become256, and its maximum result
is254. Both following original conversion helpers execute before AL is
zero-extended and stored as a word.

## Witnesses and discriminating controls

`tools/secret_random_oracle.py` records actual resolved range, resident stack
bound, original procedure visitation, observed seed before/after, exact PC,
operand types/values, destination word write, actor bytes, comparison flags and
allowed memory changes. The original seed memory must equal the explicit seed
before execution; consecutive calls carry the observed full next state. Six
complete opaque439-byte actor records remain unchanged and are never read;
this is an actor-independence witness rather than original party restoration.

Writes are limited to the original stack, seed words, parser state and declared
destination. Unrelated data and script comparison state remain unchanged.
Literal and ordinary area/bank variable ranges cover0,1,2,99,254,255,256,257,
511,65535 with nine seeds, including high-bit, FFFFFFFF, recurrence wrap-to-zero
and high-word saturation controls. In-place range/destination controls execute
the same original handler with one consistent preimage at an ordinary area
variable and7F79, including widths255/256/257.

The first global UC_HOOK_MEM_READ attempt failed at far-return address104DC8
before resident Random was reached. This matches the independently documented
Windows Unicorn stack-read hook defect. The final oracle observes only declared
seed/parser/script/variable/actor/constant windows and leaves stack reads
unhooked. Forty-five paired original executions with and without read hooks
agree on results, complete next seed, PC, operands, actual bounds, all writes,
visitation, actors and comparison flags. Return, instruction-count and timeout
assertions are unchanged; no retry or emulated-helper substitution masks failure.

Focused proof passes401 checks, exit0. The held area49 instruction at0xA40 is
`08 00 63 01 79 7F`. Complete original execution advances8A40→8A46, resolves
99, passes100 to resident Random and stores through the original7F79 setter.
With seed1234h it returns7/next3B032B05. With seed3 it returns69/next18198C10;
the previous generic native model returns94/next3CBB2586, placing those draws
on opposite sides of MALACHITE's original-proven trap value70.

## Actual old-native capture preparation

Ignored evidence is at `C:\temp\GoldBox-task247-20261011`. Fresh cases use
task246's frozen26 old-RNG binaries, owned P1, and held WHO/RANDOM/COMPARE PCs,
with source/P1/binary hash pins and explicit guest completion sentinels. No old
GSK/OWNER authority is copied. Defaultseed1234h is independently preserved.
Controlled seeds clone a genuinely generated pending effect and change only
its four GBRS seed bytes126..129; they are explicitly unowned diagnostics,
not original campaign or durable saved-state authority. Two authored width
draws expose separate actual effects and carry the first full seed through/P.

The first manual wrapper attempt exposed a DOS batch redirection issue:
an inline conditional echo opened a zero-byte failure file even on success.
Its captures remain preserved. Fresh `old-rng-v2` wrappers branch to a failure
label before opening that file. The inspector continues to reject any failure
file, requires exact selected actor identity, consumed answer and completion,
and checks both result and next seed. Preparation alone is not native RED.

## Bounded native revision and validation

Explicit Secret source selection sets RNG mode2. Only opcode08 uses the proven
`cr_bounded` recurrence and byte range; mode1 retains the existing CoK/DoK
behavior. `roll_d6` uses that helper only for mode1, preserving Secret SURPRISE
and unrelated combat dice. The original handler's range-before-destination
ordering also holds for in-place area and7F79 variables.

Secret writers emit the paired GBRS revision12, or13 when a pending state is
resumable. Source-selected admission rejects old4/5, missing paired bits,
future bits and malformed GBRS before reading menu/combat answers. Ordinary
`/P` retains12/13 import without imposing the pending bit. Generic legacy0/1
and existing exact CoK0/1 paths remain distinct; title-agnostic legacy readers
cannot infer Secret after both title bits have been stripped. The compatibility
contract records each reader's exact timing and policy. Capacity replay adds
only bit0, carrying12 to13 and preserving all32 seed bits.

Focused checks pass2872, including401 complete original executions,490 compiled
native RNG controls and232 expanded authority/source controls. Instrumented
compiled rejection tests observe no answer open/read or durable publication,
and preserve existing tokens and paused frames. All26 native tools assemble.
CCECL emits24851/resident65212/free68 against floor64; GBBOOT emits64535/
resident64791/free489 against floor128. Packed14500 and decoded16000 caps stay
unchanged. Frozen native source SHA256 is
`798b515cda714f6525d7e130bd49ef9424000387200bef12c65d06bc73b0d21c`.

Luna's seven new-binary leaf cases match original result/next-seed pairs. The
fresh owned yield-between-draws reference, cold and conflicting startup cases
preserve draw7/seed3B032B05 before the exact held WHO, then draw90/seed49666B1A
after its manual MALACHITE answer. Current P1 stays unchanged. A70PRINT stream
exercises actual CCFLOW capacity replay between those draws and closes with
the same exact state and a70-record GBSL stream. These are authored source-
compatible diagnostics using held instructions and fresh current authority;
they do not claim original Amiga executable or campaign-wide RNG parity.

The initial yield handoff prose incorrectly named its second draw72/11DC9D1A.
Generated manifests, the independent model and the strict verifier always
required90/49666B1A. Original execution and actual DOS matched those unchanged
expectations; the incorrect handoff is retained in external evidence. No test,
fixture or native bytes changed to resolve that reporting error.

Actual compatibility checks pass26 CLI cases: source-selected `/R`, both v16
menu frontends and authored v15 generic/current envelopes. A freshly generated
two-WHO stream reaches a genuine ACTIVE second pending WHO with an actual
bound answer. Eighteen isolated cold `/M` and `/R` successor revisions reject
old5, nonresumable12, missing/unknown/future bits and malformed GBRS; every
existing token, P1, GSK, OWNER and side artifact remains byte-identical. Four
actual CoK-selected generic `/P` diagnostics accept0/1 with unchanged DEADBEEF
seed and reject Secret12/13 without an effect. The empty authored GEN1 DAX and
actual KRYNN.CFG profile marker do not claim original campaign-state recovery;
exact CoK combat1 and camp/mutation0 retain separate compiled/source evidence.

Read-only final aggregation passes62/62, retaining complete per-case output at
`C:\temp\GoldBox-task247-20261011\runtime-readonly-final.json`. Twenty-six
owned yield artifacts compare exactly except explicitly named16-byte GBDO
version1/kind1 occurrence counters advancing1→2 at offset8. No complete DOP
file is excluded. Trap DAMAGE and payout remain outside this change.

The first clean release flow sweep passes43/44 and exposes a stale owned-combat
golden in `gbsecret-glib-combat-flow-test.ps1`. Cold and uninterrupted successors
already match exactly. Original area16 at0492 executes RANDOM99 from seed1234:
the new result is7/3B032B05, with terminal flags12 and GBMS7/90. Replacing only
those three prefix fields with old flags4, seed0AC49803 and destination40
recovers the complete previous golden hash. The corrected standing verifier
retains that reconstruction, the new full hash, held instruction and independent
model checks, and all P1, consumed-result and no-replay assertions. Numeric,
context and live-strength expectations stay unchanged. The failed measurement
and original runtime evidence are preserved. The repeated clean release sweeps
now pass44/44 flows and46/46 components against the committed correction.
The full boot engine-smoke passes; corpus passes11,182 /1 skip /84 warnings
in700.19s, exit0 (11,183 collected). Both sweeps bind clean unchanged native
commit8c875742 to HEAD3cc63068, canonical SHA256
`aca359e7e23704650a1a546de203ced39151bce165e038c36206e1512067d176`.
All26 final COM hashes match the frozen Luna runtime set. App build/typecheck,
engine3061/3 skips, web189/189, intros10/10, author8/8 and Electron9/9 pass.
