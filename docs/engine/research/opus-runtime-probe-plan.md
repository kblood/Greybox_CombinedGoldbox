## Gold Box Runtime Probe CLI — design review

`tools/dosbox_gamelink.py` already gives the primitives (mutex-locked peek,
compare-and-swap `poke`, RGBA `frame`, PNG writer). `tools/patch_pool_save_pose.py`
gives the safe-patch idiom (SHA-gated source, expected-value precondition,
copy-not-in-place, changed-offset assertion, JSON manifest). The probe CLI should be
a thin orchestrator over both — no new low-level code.

### Commands

- `probe run --plan plan.json --out RUN_DIR` — bounded step list (`press`, `wait`,
  `checkpoint`); caps on steps, wall-clock, and total bytes.
- `checkpoint` — one PNG + N declared peek windows + `checkpoint.json` (sha256 per
  artifact, frame sequence, monotonic timestamp).
- `probe diff A B` — per-window byte deltas and PNG hash equality; exit 1 on drift.
- `probe patch-live --site NAME --confirm` — **opt-in, exactly one** CAS poke from a
  checked-in site registry (address, expected, replacement, revert bytes); reverts on
  exit.
- `probe patch-save --source S --output O ...` — delegates to
  `patch_pool_save_pose.write_patched_save`.

### Safety invariants

1. Read-only by default; both patch paths require an explicit flag.
2. Live patch: one site per run, registry-declared, `expected` must match, revert
   attempted in `finally`, refuse if `status().program` differs from the registry's
   expected program.
3. Save patch: never in-place, never overwrite, source SHA must be a known revision,
   changed offsets must equal the declared set.
4. Bounds: peek length and window count capped; RAM-size check already enforced
   upstream.
5. Every run emits a manifest with a `claim_boundary` string; no artifact without a
   hash.
6. Single GameLink session per process — the mapping is a machine-wide singleton, so
   refuse to start if another probe lockfile is live.

### Tests

Fake-`GameLink` unit tests for step bounds, CAS-mismatch abort, revert-on-exception,
and one-site enforcement; golden manifest/diff tests; reuse Pool's existing save
fixtures for `patch-save` negative cases (wrong SHA, wrong pose, existing output).
