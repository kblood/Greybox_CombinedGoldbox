# Codex-specific supplement

Read [AGENTS.md](AGENTS.md) and its shared operating rules first. Then read this supplement
once and continue to the assigned task's references; do not loop back through startup.

## CLI model selection and helper contracts

AICC role/model assignments are not Codex CLI model availability guarantees. Use the local
wrapper's actual contract and an account-supported CLI model; do not translate Astra/Sol/Luna
role names into invented CLI model IDs or silently substitute a model after rejection.

- [ask_codex_research.ps1](tools/ask_codex_research.ps1) is the read-only research helper.
  Its declared default is `gpt-5.6-sol`. It invokes `codex exec -s read-only` at the repository
  root, captures the final Markdown answer, refuses an existing output path, and rejects
  failure or empty output. Pass `-Model` only deliberately for another available CLI model.
  The script surfaces provider rejection rather than falling back.
- [run_codex_task.ps1](tools/run_codex_task.ps1) is a **different**, write-capable bounded-task
  wrapper. Its current declared default is `gpt-6-luna` with `workspace-write`; that is a
  script setting, not proof that the account accepts the model. It also accepts `-Image`
  and `-AddDir`. Obey its delegated scope: no commit/push and no edits outside the assignment.
- The task wrapper documents a specific DOSBox sandbox limitation and a historically
  authorized explicit `-Sandbox danger-full-access` workaround; the
  [decision record](docs/engine/DECISIONS-NEEDED.md) records that case. This is not a blanket
  sandbox bypass. Current harness permissions, execution holds and the shared native safety
  rules still apply; unavailable permission or model support is a blocker to report.
- Do not modify Codex authentication/configuration to make a consultation work. On auth
  failure, ask the user to run `codex login` and stop that consultation. Do not commit raw
  CLI transcripts. Research answers remain advisory until checked against local evidence.

Example, from the repository root (a fresh output path is required):

```powershell
pwsh tools/ask_codex_research.ps1 `
  -Prompt 'Identify the next discriminating native explorer-render parity experiment.' `
  -OutputPath docs/engine/research/codex-explorer-parity-advice.md
```

## Autonomous-session recovery

After shared startup, use the assigned track's goal from the [project index](README.md),
not automatically the root goal for every task. For an authorized persistent/full-auto
continuation, reconcile any persisted Codex goal with that document and current evidence.
If the goal facility is available and the objective is absent, restore the authorized
objective without a token budget. Do not register an unbounded objective for a bounded
consultation or resume work that the user has paused. The resume phrase
`resume goldbox full-auto` selects the shared continuation procedure, not the old Claude
model schedule.
