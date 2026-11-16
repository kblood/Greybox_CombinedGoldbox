# Gold Box Runtime Probe

`tools/goldbox_runtime_probe.py` is the user-facing, GameLink-only companion for
observing an original Gold Box DOS session. It creates small, reproducible evidence
sets rather than attempting to decode unproven game state. It never sends host input
or focuses a DOSBox-X window.

## What it records

A `checkpoint` creates a new directory containing:

- `screen.png`, acquired from the GameLink RGBA framebuffer;
- one `.bin` file per explicitly declared physical-memory window; and
- `manifest.json`, with GameLink status, capture metadata, relative filenames, and
  SHA-256 hashes for every artifact.

The command requires regions by name and caps a capture at 32 windows and 1 MiB. It
does **not** default to a full RAM dump.

```powershell
python tools\goldbox_runtime_probe.py checkpoint `
  --output build\runtime-probe\cok-title `
  --label before `
  --region bios=0x400:0x100 `
  --region scratch=0x1000:0x100

# Repeat the identical layout after a GameLink-driven action, then compare it.
python tools\goldbox_runtime_probe.py checkpoint `
  --output build\runtime-probe\cok-title `
  --label after `
  --region bios=0x400:0x100 `
  --region scratch=0x1000:0x100
python tools\goldbox_runtime_probe.py diff `
  --before build\runtime-probe\cok-title\before `
  --after build\runtime-probe\cok-title\after `
  --output build\runtime-probe\cok-title\before-to-after.json
```

The diff validates the input hashes and layout before comparing. It records contiguous
changed runs, hashes for each run, and a short hex preview. A changed byte is evidence
of a byte change only—not proof of a coordinate, map, event, or script field.

## Guarded live-memory experiments

Live writes are deliberately awkward. A patch is exactly one contiguous
compare-and-swap hunk, requires the exact `status.program`, requires the current
bytes to equal `--expected`, and does nothing unless `--apply` is present. It writes a
non-overwritable audit manifest only after the GameLink CAS verifies the replacement.

```powershell
# First capture a checkpoint containing the candidate address. Establish its meaning
# with repeated, reversible evidence before using a different replacement byte.
python tools\goldbox_runtime_probe.py patch-live `
  --address 0x12345 `
  --expected 0f `
  --replacement 0e `
  --program GAME.EXE `
  --reason 'Verified test fixture: adjust one byte after matching checkpoint' `
  --output build\runtime-probe\live-patch.json `
  --apply
```

Do not use guessed addresses or values. A failed expectation is a successful safety
outcome: the guest changed and the tool did not write. The tool intentionally does not
provide generic teleporting or map editing; those need title-specific, byte-proven
plans first.

## Guarded save-copy editing

The save path never alters its source or an existing target. It needs a JSON plan that
locks source size and SHA-256 plus the one expected/replacement byte range:

```json
{
  "schema_version": 1,
  "offset": 12801,
  "expected_hex": "0f",
  "replacement_hex": "0e",
  "source_size": 13137,
  "source_sha256": "<the exact source file SHA-256>"
}
```

Run it once without `--apply` to validate the plan, then repeat with `--apply` to
write a distinct copy and its `*.runtime-probe.json` manifest:

```powershell
python tools\goldbox_runtime_probe.py patch-save-copy `
  --source 'C:\Games\Pool\SAVGAMA.DAT' `
  --output build\runtime-probe\SAVGAMA-edited.DAT `
  --plan build\runtime-probe\pool-pose-plan.json `
  --apply
```

Use the existing title-specific patchers such as `tools/patch_pool_save_pose.py` when
their stronger semantic checks cover the task. The generic probe plan is only a
byte-level, copy-only editing primitive; it does not copy sidecars or claim that the
resulting save is valid.

## Evidence and verification

The implementation was designed from the independent advisory memos
[`codex-runtime-probe-plan.md`](codex-runtime-probe-plan.md) (Sol) and
[`opus-runtime-probe-plan.md`](opus-runtime-probe-plan.md) (Opus), then verified with:

```powershell
python tools\test_goldbox_runtime_probe.py
python -m unittest tools.test_dosbox_gamelink
```

On 2026-07-26, a retail *Champions of Krynn* `START` GameLink session was launched
with the repository's owned DOSBox-X launcher. The probe captured two 512-byte
named-window checkpoints and their PNGs, produced a hash-validated diff (one changing
BIOS tick byte; static low-memory window unchanged), and exercised an explicit no-op
CAS at physical `0x1000` (`00` → `00`) without changing game state. The ignored
artifacts are under `build/runtime-probe-live-cok/`.

This is an integration proof of the GameLink data path, not evidence that any observed
address is a Gold Box game field.
