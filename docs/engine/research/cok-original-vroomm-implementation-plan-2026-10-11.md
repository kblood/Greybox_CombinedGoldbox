# Original CoK VROOMM implementation plan

Astra read-only planning pass, 2026-10-11. This is an implementation plan,
not a compiled-manager result. Source traversal counts below are planner
findings; runtime coverage must be measured separately. Root independently
confirmed the `MOV AX,0BC6h` bytes and relocation at image A1F2h.

Next implementation should be **wrapper → relocated resident dispatch → original initializer/manager → mutable stubs and eviction acceptance**, building on SOL’s callback work without duplicating it.

I read the requested files and relevant conventions, and decoded source bytes read-only. No edits, installations, game execution, or DOSBox runs.

1. **Lift the wrapper’s successful path first.**

   `0614:0492` forwards `[BP+6]` through the far pointer at `DS:885F`, tests AX, and returns through original `RETF 2`. A bounded control-flow traversal finds **13 instructions** when the error route at `04A3` is an explicit unsupported boundary. There are no instruction relocation words in that successful slice.

   Implement memory-indirect far CALL: read the complete m16:16 operand using the original addressing/segment rules before changing SP; push caller CS, then next IP; transfer through guest CS:IP. Admit the saved original callback through module identity and byte validation. Do not turn `[885F]` into a special host callback invocation.

   AX≠0 must stop at `04A3` until the three original `0962` error services and retry route are lifted. The existing five-call proof did **not** execute this wrapper; wrapper acceptance is separate.

2. **Extend instruction support from reachable source, not the preliminary linear scan.**

   Following direct control-flow edges from `09F0:02E6`, plus the installed post-callback `02E5`, produces **262 instructions**, with the error target `09F0:0000` explicitly blocked. The indirect edges remain `[4376]` and `[8A5A]`; this establishes a bounded static closure, not proof that every branch executes.

   Required additions are:

   | Operation | Required behavior |
   |---|---|
   | Indirect far CALL | m16:16 operand, guest return frame, admitted dynamic destination |
   | STI | Set IF, preserve other flags; represent interrupt inhibition if asynchronous interrupts are supported |
   | STOSW | Write AX at ES:DI; adjust DI by ±2 according to DF |
   | REP MOVSW | DS:SI → ES:DI, ±2, decrement CX per completed word, preserve flags; zero count does nothing |
   | INT 3F / IRET | Architectural interrupt frame and restoration |
   | EA far JMP | Execute the actual patched five-byte public stub without pushing a return frame |

   `REP MOVSW` must preserve original forward/backward overlap behavior; a bulk host copy is insufficient. Keep execution budgets and fault handling effective during repeats.

   Full initializer reachability from `09F0:0012` additionally exposes **REPE CMPSB and STC**, through failed-open environment/PATH searches. REPE CMPSB performs byte comparisons, updates arithmetic flags, advances according to DF, and stops on CX=0 or mismatch. **ROL/ROR appear in adjacent routines but are not dependencies of these selected roots.**

3. **Make resident relocation and module identity coherent before manager acceptance.**

   Load the complete resident image with all **621 fixups**, including at base `1000h`. Resolve source segments relative to that base throughout dispatch, constants, protection ranges, far-call operands, and byte checks.

   A concrete required case is manager `09F0:02F1`, `MOV AX,0BC6h`: its immediate word at image offset **A1F2h** is relocated. At base `1000h`, both its checked bytes and executed value must represent `1BC6h`. Checking relocated bytes while emitting the original immediate would still be wrong.

   Replace the fixed resident-CS tests and single overlay slot with identities containing source image/container identity, descriptor identity, source extent, current segment, relocation base, and generation. Keep immutable source bytes separate from expected relocated bytes. Segment `3000h` alone cannot identify a module.

4. **Execute the original initializer and architectural manager entry.**

   The narrow first acceptance needs DOS open `3Dh`, absolute seek `4200h`, read `3Fh`, and vector install `253Fh`, backed by immutable GAME.OVR bytes and a real cursor. AX=253Fh writes DS:DX into the guest IVT; it does not select overlays.

   INT 3F pushes FLAGS, CS, and next IP, clears IF/TF, then loads the installed vector. Original manager code must read the inline selector, patch the saved frame, invoke callbacks, and execute IRET. IRET pops IP, CS, FLAGS with the declared FLAGS policy; preserve defined-flag tracking without inventing knowledge.

   For a bounded successful-open initializer milestone, explicitly reject unimplemented fallback paths. Completing the initializer’s reachable alternatives also requires DOS version `30h`, close `3Eh`, and faithful PSP/environment inputs. Preserve the callback’s seek-failure stop contract.

5. **Admit actual self-modification and observe original allocation decisions.**

   Permit original stores to descriptor fields and complete public-stub arrays. Validate stable stub forms against source procedure offsets:

   - Unloaded wall: `CD3FA20600`
   - Loaded at `3000h`: `EAA2060030`

   Intermediate stores need not themselves form executable instructions; admission must validate the complete current stub before execution. CD 3F enters the architectural interrupt path; EA executes the encoded jump. Neither form authorizes host routing.

   After original read/fixup completes, verify the entire body against independently relocated source before admitting execution. On original moves, evictions, and reloads, invalidate stale bindings and advance generations. Original routines at `049E`, `0506`, and `0512` must perform copying and saved-frame repairs themselves. Metadata observes and validates those decisions.

   Add descriptor `0105` for pressure testing: its initializer at body offset `0884` is only four instructions ending in RETF. Loading still requires validating its complete 2,185-byte body and 68 fixups. Keep the 350-paragraph arena explicitly labelled a fixture; original boot heap allocation remains separate work.

6. **Use focused differential acceptance.**

   Compare compiled C called through Rust against the documented original-only sequence:

   - Initializer.
   - First wall through CD 3F.
   - Repeated wall through patched EA, with no file events.
   - `0105` initializer causing eviction.
   - Wall reload with a new generation.

   Compare registers, defined flags, stack frames, memory changes, exact file events, descriptor/list transitions, relocated bodies, and **all five stub bytes**. Preserve the documented register carry-over between calls. Repeat at resident bases zero and `1000h`.

   Add wrapper success/error-boundary cases, stale-generation and code-byte mutations, invalid indirect/vector targets, short reads, and relocation mismatches. Separately exercise code movement and BP-linked return-frame repair: the five-call eviction proof does not establish every compaction branch.

The existing `original5call` result is an oracle, **not shipped Rust+C manager functionality**. Completing this plan establishes original overlay management; original boot, platform services, display execution, and eventual full gameplay remain subsequent mechanical-lift milestones.
