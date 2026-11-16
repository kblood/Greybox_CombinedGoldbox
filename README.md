# GoldBox / Greybox project

This repository investigates SSI Gold Box games and develops three related but distinct
runtime tracks. [AGENTS.md](AGENTS.md) is the agent startup entrypoint; project descriptions
belong here and in the linked track documents, not in tool-specific instructions.

## Tracks and current direction

Keep the project tracks together on the primary `master` branch, in the folders
below. Research covers every Gold Box game and its platform/edition variants,
including DOS, Amiga and C64; findings should identify the exact title, platform,
edition and source evidence. The browser Greybox engine and native DOS ASM engine
use that research to check the recovered formats and behavior. Neither engine's
progress establishes that every version has been fully reconstructed.

| Track | Goal and authoritative references |
| --- | --- |
| **Native DOS Greybox — primary shared continuation** | One new clean-room DOS engine for all Gold Box titles, using the player's own assets and per-platform artwork selection. It is **not** SSI's DQK executable with CoK/DoK content retargeted into it. Read [native documentation](native/README.md), the [continuation goal](GOAL.md), [handoff](docs/engine/HANDOFF.md), and [native backlog](docs/engine/NATIVE-TASKS-2026-09-12.md). |
| **Original CoK reconstruction — separately assigned Rust track** | Its lifted-code implementation, README, and track goal are omitted from this share draft pending separate review; see [SHARE-REVIEW.md](SHARE-REVIEW.md). The [complete game plan](docs/engine/research/cok-rea-full-game-plan-2026-10-15.md) remains included. The root GOAL is not this track's goal. |
| **Browser/Electron Greybox and authoring — secondary** | A clean-room universal player, live graphics switching, Companion tools and a FRUA-superset authoring suite. Read the [vision](docs/engine/VISION.md), [TypeScript architecture](docs/engine/ARCHITECTURE.md), [roadmap](docs/engine/ROADMAP.md), and [web specification index](docs/web-engine/README.md). Existing deployed software is not merely a planning proposal. |

The tracks share format knowledge and evidence, not interchangeable source code or acceptance
claims. The Rust original-code lift is not the clean-room TypeScript or native ASM engine.
Task-specific user assignments can select a track and override the default role allocation.

## Finding current work and evidence

- The [program charter](docs/engine/LONG-TERM-GOALS.md) records durable Greybox goals;
  the [build queue](docs/engine/BUILD-QUEUE.md) and each track's goal/handoff record bounded work.
  Revalidate dated status against source and runtime evidence before selecting a task.
- [Consolidated findings](docs/findings.md) is the authoritative format synthesis over older
  individual research notes, not an override of current product direction.
- [DOS inventory](docs/dos-inventory.md), [Amiga inventory](docs/amiga-inventory.md),
  [held versions and source locations](docs/goldbox-versions-holdings.md), and
  [platform census](docs/goldbox-ports-census.md) describe assets and provenance. Holdings are
  machine-local observations, not a guarantee that a fresh clone has those assets.
- Format references: [DAX](docs/dax-format.md), [DAA](docs/daa-format.md),
  [HLIB](docs/hlib-format.md), [Pool-Amiga](docs/pool-amiga-format.md), and
  [C64 disks](docs/engine/research/c64-disk-format.md). Sniff bytes, not filename extensions:
  DOS HLIB/Amiga GLIB and DOS DAX/Pool-Amiga reuse extensions.
  **Five** container formats are in play: DAX, DAA, HLIB, GLIB and Pool-Amiga.
  IFF/ILBM is a single-image format, not a sixth container.
- The live private verification site is `https://dionysus.dk/greybox/`.
  [Shared release/deployment rules](docs/engine/ORCHESTRATION.md#website-build-and-deployment)
  distinguish a Git push from deployment and from permission for public distribution.

## Workspace and historical context

`native/` contains the DOS clients; the original-code lift under `rust/cok-recomp/` is omitted
from this share draft pending separate review (see [SHARE-REVIEW.md](SHARE-REVIEW.md));
`packages/engine/` the TypeScript core; `apps/` the browser, authoring and Electron shells;
`tools/` format/research/test tooling. The three game-named root folders are local DOS/GOG
source material: CoK and DoK use DAX; DQK uses HLIB (`.TLB`/`.GLB`), **not DAX**.
Local dumper/hackdocs archives and `*_extracted/` outputs may be absent on another machine.

The former CoK/DoK-on-DQK deliverable is parked. Its conversion tooling and
[content-port research](docs/engine/research/cok-content-port-plan.md) remain useful format
and authoring history, not evidence of the new native engine's completion. The dated
[round-37 plan](docs/engine/PLAN-ROUND-37.md), [DOS handoff](docs/engine/HANDOFF-NATIVE-DOS-2026-09-08.md)
and later track records preserve the correction/test history formerly accumulated in
CLAUDE.md. Historical model schedules, capacity figures and pass counts are not active
instructions or current measurements.

### Retained capability corrections

The former roadmap used to say "Reading HLIB is the next concrete step"; `decodeHlib`
already had app consumers when that claim was retracted in round 35. The browser goal
also used to say "Planning only for now"; the deployed browser engine and its standing
[full e2e harness](apps/web/test/e2e.mjs) contradict that description.

The HLIB writer [hlibEncode.ts](packages/engine/src/loaders/hlibEncode.ts) and Amiga
conversion code are **asset-conversion tooling**, not proof of native engine completion.
They are not uncalled: [build-dqk-dir.mts](tools/build-dqk-dir.mts) calls
`buildPortableArtOverrides`, which calls `buildAmigaArtOverride` in
[dqkArtMap.ts](packages/engine/src/loaders/dqkArtMap.ts). That real tooling chain does not
revive the parked CoK/DoK-on-DQK deliverable or establish full engine capability.
