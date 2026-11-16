# Shared agent entrypoint

All agents must follow this startup order, once per session:

1. Read this file and the shared [operating and coordination rules](docs/engine/ORCHESTRATION.md).
2. Read **only the applicable tool supplement**: Claude/Claude Code agents must read
   [CLAUDE.md](CLAUDE.md); Codex/Codex CLI agents must read [CODEX.md](CODEX.md).
   Other agents need neither supplement. A model name alone does not select a tool supplement.
3. Read the [project overview and track index](README.md), then the goal, handoff,
   safety notices and reference documents for the assigned task. Check for nested instruction
   files before editing that subtree.

If a tool automatically loads its supplement first, complete steps 1–3 without rereading
files already read. Supplement backlinks identify this entrypoint, not a recursive read loop.

The shared rules are canonical for the continuous-task role loop, execution safety,
verification, commit/push and atomic website deployment. Tool supplements do not redefine
those policies. Explicit user/task assignments override default roles; higher-priority
system, developer and user instructions override repository instructions. A bounded task
or execution hold is not permission to perform unrelated work or bypass its restrictions.
