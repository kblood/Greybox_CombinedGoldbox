# Hybrid DOS reconstruction with Rust and current Gold Box projects

Research date: 2026-10-11. Scope: preserving original machine code while recovering a game,
mechanically translating it to another language, and current external Gold Box projects.

The user has selected **lift to C and call it from Rust**, starting with Champions of Krynn.
The [active reconstruction goal](cok-c-rust-reconstruction-goal.md) records the first
machine-state gate and progression toward a playable game.

**A gradual hybrid runtime is a real shortcut.** Original instructions can continue running
in a guest CPU while new host functions replace recovered routines. Rust can be the host;
Spice86 already supplies this workflow in C#. Another route translates instructions into
compilable C with an explicit guest CPU state, then calls that library from Rust. Neither
route requires readable, fully reconstructed source for the whole game first.

The strongest practical precedents are Cryogenic for DOS Dune and OpenUA for Macintosh FRUA.
Gold Box compatibility still needs an experiment: no external project below establishes a
ready-made universal Rust runtime for this repository's FBOV/VROOMM and RTLink games.
Reported gameplay milestones below are the respective authors' results, not independent
playthroughs performed for this survey.

## What a wrapper must preserve

Keeping assembly unchanged means keeping its execution environment. In a modern Rust
process, original real-mode x86 bytes need a guest CPU. An ordinary `extern` function or
inline assembly block does not provide DOS interrupts, segment registers, far pointers,
the old stack convention or hardware devices. Rust's [assembly reference](https://doc.rust-lang.org/reference/inline-assembly.html)
and [FFI model](https://doc.rust-lang.org/nomicon/ffi.html) describe host interfaces.

An alternative is instruction lifting: generate C/Rust operations on a structure holding
guest registers, flags and memory. This avoids executing those instructions directly on
the host CPU, but retains their machine semantics until enough behavior is recovered to
replace them with ordinary game functions.

```text
Modern Rust display, input and file services
                   |
          Shared guest memory and CPU state
              /                   \
 Original x86 routines      Recovered Rust or C routines
   on a guest CPU           replacing selected guest calls
```

For Gold Box, the wrapper contract must include 8/16-bit overflow, FLAGS, near/far returns,
segment aliasing, relocated data, and overlay identity. A physical CS:IP alone is not a
stable function identifier when an overlay window is reused. A replacement should be keyed
by title/binary hash, overlay identity, relative offset and loaded code version. Loader
patches or other changed instructions must invalidate stale translated blocks. This is a
design inference from the existing mapper and original-loader evidence.

## DOS precedents

| Project | Actual method | Relevant limit |
| --- | --- | --- |
| [Spice86](https://github.com/OpenRakis/Spice86) and [Cryogenic](https://github.com/OpenRakis/Cryogenic) | Original real-mode DOS Dune CD code and C# replacements share emulated memory. Spice86 records executed control flow and generates runnable override projects. Cryogenic reports a playable game with sound/music. | C# output, not Rust. Coverage follows explored routes; unreplaced ASM remains. EGA/CGA support is described as best effort, so Gold Box rendering needs a compatibility check. |
| [OpenDUNE](https://github.com/OpenDUNE/OpenDUNE) | Dune II reconstruction that started with 16-bit-to-C translation and a DOS layer, then became native C. | Its [2009 author announcement](https://forum.dune2k.com/topic/20614-opendune/) explicitly reports an initial JIT fallback because overlay calls rewrote themselves. This is a close warning for Gold Box loaders. |
| [M-HT/SR](https://github.com/M-HT/SR) | Static recompilation produces assembler/LLASM from original executables plus title-specific annotations; real ports include Albion and X-COM. | Its [DOS loader](https://github.com/M-HT/SR/blob/master/SR/SR_loader.c) expects LE/DOS-extender structures. This is not a demonstrated Gold Box real-mode MZ/overlay importer. |
| [pcrecomp](https://github.com/sp00nznet/pcrecomp) and [Civilization Recomp](https://github.com/sp00nznet/civ) | Actual x86-16-to-C tooling plus a register/FLAGS/segmented-memory runtime. Civ reports intro/menu, world generation and civilization selection. | Civ also documents a stubbed map blitter/solid-fill map. Compilable generated functions are not proof of a fully playable game. |
| [dosbox-hooks](https://github.com/emmericp/dosbox-hooks) | TypeScript installs x86 trampolines and injected C/C++ code inside DOSBox; a real-game branch accompanies the sample. | The C becomes guest 16-bit instructions, not host-native C. The author calls it a proof of concept and lists recursion/reentrancy restrictions. |
| [Another World Engine in Rust](https://github.com/Gnurou/awer) | Rust reimplements the game's script VM and renderer, preserving original script data. | This is a useful ECL analogue, not automatic x86-to-Rust translation. |

The important Spice86 mechanism is a mapping from guest function addresses to host
replacements, with guest memory still shared. Its generated project pins the executable
checksum. It can reduce the need to manually translate every reachable function before
having a runnable result. A Gold Box trial must still establish overlay handling and the
required DOS/graphics behavior. See the [override documentation](https://github.com/OpenRakis/Spice86#overriding-emulated-code-with-c-code)
and [Cryogenic architecture](https://openrakis.github.io/Cryogenic/).

pcrecomp is an actual new 16-bit candidate, unlike several general LLVM lifters. Its
[lift16.py](https://github.com/sp00nznet/pcrecomp/blob/main/tools/lift/lift16.py) emits
instruction-shaped C functions receiving `CPU*`; its
[cpu.h](https://github.com/sp00nznet/pcrecomp/blob/main/runtime/recomp16/cpu.h) carries the
guest machine state. This makes C plus Rust FFI plausible without first turning every
guest pointer into a native Rust reference. Gold Box's Borland overlay routing would still
need integration and differential verification.

Its stock lifter also simplifies some guest CALL/RET behavior and can comment unsupported
instructions rather than reject them. It is not an exact guest ABI adapter unchanged;
the first Gold Box slice needs explicit returns, stack effects and failure handling.

## Rust options and tool limits

| Route | Evidence | Assessment for this repository |
| --- | --- | --- |
| Rust plus Unicorn | The [public API](https://github.com/unicorn-engine/unicorn/blob/master/include/unicorn/unicorn.h) explicitly has x86 `UC_MODE_16`, memory/register access, and interrupt/IN/OUT/code hooks. [Rust bindings](https://docs.rs/unicorn-engine/latest/unicorn_engine/struct.Unicorn.html) expose the guest interface. | The smallest likely experiment, because existing Python oracles already use the same CPU framework. A whole game still needs DOS/BIOS/files/timer/video/audio services. |
| Lift to C, then Rust FFI | pcrecomp supplies a real 16-bit C route; C ABI can carry a guest-state pointer. | Keep correct generated C first and replace selected functions with Rust. FFI does not solve guest ABI or overlay recovery by itself. |
| C2Rust after a C reconstruction | [C2Rust](https://github.com/immunant/c2rust) migrates C source and build information, typically retaining low-level `unsafe` operations initially. | Saves language-conversion work once C compiles and behaves correctly. It does not take a DOS EXE or Ghidra pseudocode and produce a faithful game automatically. |
| Remill and McSema | [Remill's x86 decoder](https://github.com/lifting-bits/remill/blob/master/lib/Arch/X86/Arch.cpp) chooses 32/64-bit states; [McSema](https://github.com/lifting-bits/mcsema) documents 32/64-bit ELF/PE and is archived. | No verified ready-made x86-16 Gold Box path. General x86 support is insufficient evidence. |
| RetDec | [Supported targets/formats](https://github.com/avast/retdec) list x86-32/x86-64 and do not establish DOS MZ/x86-16. | Not a demonstrated direct solution for these inputs. |
| Native DOS Rust | [rusty-dos](https://github.com/Serentty/rusty-dos) demonstrates an experimental COM/code16 target; DOS/8086 is not a normal [Rust platform target](https://doc.rust-lang.org/rustc/platform-support.html). | Separate compiler/runtime work. A modern Rust guest-CPU host does not itself satisfy the native DOS Greybox deliverable. |
| A permissive Rust CPU core | [MartyPC](https://github.com/dbalsom/martypc) has an MIT, frontend-independent `marty_core`; [DOS-Emulator](https://github.com/Lichtso/DOS-Emulator) is MIT and reports playable ROBOT games. | Real alternatives worth a compatibility trial. MartyPC focuses on 8088/V20-era machines; neither source establishes all Gold Box ISA/device requirements. |

Unicorn's [core COPYING](https://github.com/unicorn-engine/unicorn/blob/master/COPYING)
and current [Rust workspace metadata](https://github.com/unicorn-engine/unicorn/blob/master/Cargo.toml)
identify GPL-2.0. It remains a useful research/oracle dependency; an integrated product must
account for that dependency rather than treating the Rust wrapper as automatically MIT.
Spice86/Cryogenic identify Apache-2.0; OpenUA identifies GPL-2.0; Amber Folio identifies
AGPL-3.0-only. Existing repository policy treats incompatible/unlicensed implementations
as study references. License metadata is separate from rights to original game code/assets.

## New Gold Box projects

The most relevant new source is **OpenUA**. It reconstructs Macintosh 68k FRUA in C,
retains assembly where needed, and replaces the Mac Toolbox with a compatibility layer
and platform HAL. Its [ADR-0002 and ADR-0003](https://github.com/slaapliedje/OpenUA/blob/main/docs/decisions.md)
document the hybrid decision; ADR-0009 describes hand lifting from annotated disassembly.
This is unusually close to the proposed shortcut. The same 68k CPU family allows retained
ASM on Atari/Amiga; moving DOS x86 to a modern Rust host needs emulation or instruction
translation instead. Its [decompilation workflow](https://github.com/slaapliedje/OpenUA/blob/main/docs/decompilation.md)
covers CODE segments, jump tables, A5 globals and relocations.

| Project | Source game and platform | Public implementation and scope |
| --- | --- | --- |
| [OpenUA](https://github.com/slaapliedje/OpenUA) | Macintosh FRUA, ported to Atari Falcon/TT/ST/STE and Amiga AGA/RTG/ECS | C plus retained 68k ASM and Toolbox shim; playable-beta author reports, including real Falcon hardware. FRUA modules are not direct executable support for every original Gold Box game. |
| [DOS Decode Kit](https://github.com/DrEvil-TitaniumHelix/dos-decode-kit) | DOS Pool of Radiance | Python analysis and HTML/JavaScript reconstruction. README explicitly distinguishes its method from decompilation. Relevant ECL/rendering research; completion claims need independent verification. |
| [Amber Folio](https://github.com/amberfolio/amberfolio) | DOS Pool of Radiance and intended Gold Box family | C++ real-mode/EGA/sound emulator, desktop and browser/WASM. Runs the unmodified original EXE and applies optional in-memory enhancements. A direct wrapper precedent, not a recovered replacement engine. |
| [aolnwn](https://github.com/suinswofi/aolnwn) | AOL Neverwinter Nights, DOS client | JavaScript/Node host/protocol reconstruction; patched client remains in DOSBox. No whole-client native decompile demonstrated. |
| [Wish](https://github.com/malcyon/wish) | Primarily PoR with C64/DOS/Amiga work | Python save editor/automapper with memory/disassembly research. Useful cross-platform findings, not a full engine decompile. |
| [poolrad-macmaps](https://github.com/huntergdavis/poolrad-macmaps) | Macintosh PoR | Mini vMac companion/automap and memory research with C/Android work. Useful platform evidence, not full game reconstruction. |

The older [CoAB](https://github.com/simeonpilgrim/coab) remains a same-game source oracle.
[TiCoKH/ssi-engine](https://github.com/TiCoKH/ssi-engine), derived from Farmboy0's Java
engine, describes partial title support with combat/party gaps. Neither is a new universal
Rust decompile. The public [bsimser/frua](https://github.com/bsimser/frua) repository contains
README/license rather than an implemented engine; its feature prose cannot establish a port.

Searches covered Gold Box/GoldBox, decompile/reverse engineering/reconstruction, FRUA,
PoR/Krynn/Buck Rogers/AOL NWN, and DOS/Mac/Amiga/C64/Apple-family platforms. No verified
new public Gold Box Rust decompile was found. This is a bounded search result; the positive
OpenUA discovery shows why a platform-wide survey is more useful than DOS-only searching.

## Activity snapshot

Dates below are commit dates in Europe/Copenhagen, not download/crawl dates or evidence
that a gameplay feature was newly completed. Repository creation and latest-main metadata
were checked with GitHub's public repository/commit API on 2026-10-11.

| Project | Repository created | Latest inspected commit |
| --- | --- | --- |
| OpenUA | 2026-05-21 | [48224774](https://github.com/slaapliedje/OpenUA/commit/48224774), 2026-09-21 |
| Amber Folio | 2026-08-16 | [f8b0d19b](https://github.com/amberfolio/amberfolio/commit/f8b0d19b), 2026-10-11 |
| DOS Decode Kit | 2026-06-13 | [d9f7fb45](https://github.com/DrEvil-TitaniumHelix/dos-decode-kit/commit/d9f7fb45), 2026-06-13 |
| pcrecomp | 2026-02-27 | [8f4aa77a](https://github.com/sp00nznet/pcrecomp/commit/8f4aa77a), 2026-10-11 |
| Civilization Recomp | 2026-02-26 | [491eb9be](https://github.com/sp00nznet/civ/commit/491eb9be), 2026-09-21 |

## A bounded Gold Box experiment

The selected first experiment is now implemented and independently verified in the
[active goal record](cok-c-rust-reconstruction-goal.md): generated C from 32 original
RNG instructions runs through Rust, with 440 original-code comparisons. REA also passed
a real DOS load-image pilot, but its default pseudocode exposed a wrong CS-relative
constant binding. These results support the staged approach and its explicit guest-state
contract; they do not establish whole-game reconstruction.

The repository already has a partial execution carrier: `tools/cok_item_removal_oracle.py`
executes original callbacks, operand readers, equipment/recalc and allocation code under
Unicorn, while providing a controlled guest environment. The
[Task 198 original-loader trace](cok-task198-original-demo-combat-boundary-2026-09-28.md)
uses original START/VROOMM loading through CoK's demo COMBAT boundary. Neither is already
a complete playable hybrid engine, but both reduce the initial work.

Start with a Rust wrapper around the known CoK RNG, whose bytes and boundary cases are
documented in [cok-rng-native.md](cok-rng-native.md). Load the user's original unpacked
resident image, establish guest registers/stack/data, and capture result, state and memory
changes at the real return boundary. Compare the same vectors through the original routine
and an independently implemented Rust replacement. Include zero/max bounds, full-width seeds,
byte wrapping, repeated calls and near/far return effects. A successful comparison supplies
a reusable guest-call contract rather than only one plausible output.

Then add one pointer-based operation, such as a selected-character field read, to establish
guest identity and memory aliasing. Only after that should a trial introduce an overlay call
and original file services. Use the existing
[decompiler packages](decompiler-project-inputs.md), VROOMM layout and RTLink map to identify
code; keep their synthetic import addresses separate from runtime addresses.

In parallel, evaluate Spice86 for one complete unmodified CoK boot/demo route before relying
on generated overrides. If the carrier works, replacing display/input/resource routines can
retain original game logic while exposing modern UI/art. If it fails on loader or EGA behavior,
record the first unsupported dependency rather than treating CFG generation as compatibility.

For static translation, compare one pcrecomp-generated C routine with the same original-code
oracle before investing in whole-image generation. Rust FFI can host that C; C2Rust is a later
language migration option. This route may reduce manual ASM translation, but unknown indirect
targets and machine-state semantics remain real work.

The user subsequently authorized the C-to-Rust Champions reconstruction described in the
active goal. This survey supplies the rationale; implementation and runtime results belong
to the new milestone record.
