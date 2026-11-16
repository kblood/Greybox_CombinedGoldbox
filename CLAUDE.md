# Claude-specific supplement

Shared startup and repository policy live in [AGENTS.md](AGENTS.md). If Claude Code loaded
this supplement automatically, read the shared entrypoint and its operating rules first;
then finish this supplement once and continue to the task references listed there.

## Claude Code tools and context

- The optional Claude Code researcher and planner definitions under
  `.claude/agents/` are local-only and are not included in this share draft. They are not
  replacements for the shared AICC role assignments;
  use them only when the assigned task permits Claude research/planning.
- For a bounded read-only Claude consultation, use
  [ask_claude_research.ps1](tools/ask_claude_research.ps1). It defaults to `opus`, invokes
  `claude -p --model opus --permission-mode plan`, refuses an existing output memo, and
  writes UTF-8 Markdown only after a successful, nonempty answer. Supply a fresh
  `-OutputPath` and an explicit evidence-focused `-Prompt`.
- The optional `.claude/skills/codex/SKILL.md` entry for independent Codex consultation is
  local-only and is not included here; it is not a model-selection policy for AICC.
- Claude auto-memory is a context aid, not repository authority. Reconcile remembered
  state with the assigned track's goal and current evidence; record durable findings in
  the repository rather than only in memory.
- [Claude autonomy research](docs/engine/research/claude-code-autonomy.md) is a dated
  capability/setup proposal, not proof that hooks, schedules or permissions are installed.
  Verify available tool features before relying on them.
